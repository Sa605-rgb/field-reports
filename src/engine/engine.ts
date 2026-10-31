import { assertSendable, backoffMs } from './policy';
import type { LocalReport, PumpContext, PumpOutcome, TransferResult } from './types';

function replace(reports: LocalReport[], id: string, map: (report: LocalReport) => LocalReport): LocalReport[] {
  return reports.map(report => (report.id === id ? map(report) : report));
}

function scheduleRetry(reports: LocalReport[], id: string, reason: string, now: number): LocalReport[] {
  return replace(reports, id, report => {
    const attempts = report.attempts + 1;
    return {
      ...report,
      status: 'queued',
      attempts,
      nextAttemptAt: now + backoffMs(attempts),
      lastError: reason,
      images: report.images.map(image =>
        image.status === 'uploading' ? { ...image, status: 'pending', bytesSent: 0 } : image,
      ),
    };
  });
}

function stopReport(reports: LocalReport[], id: string, reason: string): LocalReport[] {
  return replace(reports, id, report => ({
    ...report,
    status: 'needs_you',
    lastError: reason,
    nextAttemptAt: null,
    images: report.images.map(image =>
      image.status === 'uploading' ? { ...image, status: 'pending', bytesSent: 0 } : image,
    ),
  }));
}

function applyTransfer(kind: TransferResult['kind']): 'ok' | 'retry' | 'stop' {
  if (kind === 'ok' || kind === 'already') {
    return 'ok';
  }
  return kind;
}

/**
 * One step of the queue. Call it again while action is progress.
 * persist() runs before any wait on the network, so a kill keeps the last safe point.
 */
export async function pumpOnce(reports: LocalReport[], ctx: PumpContext): Promise<PumpOutcome> {
  const now = ctx.now();
  const pending = reports
    .filter(report => report.status === 'queued' || report.status === 'uploading')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (pending.length === 0) {
    return { reports, action: 'idle', waitMs: null };
  }

  const ready = pending.filter(report => report.nextAttemptAt == null || report.nextAttemptAt <= now);
  if (ready.length === 0) {
    const nextAt = Math.min(...pending.map(report => report.nextAttemptAt ?? now));
    return { reports, action: 'wait', waitMs: Math.max(0, nextAt - now) };
  }

  if (!ctx.online()) {
    return { reports, action: 'wait', waitMs: null };
  }

  const current = ready[0];
  const blocked = assertSendable(current);
  if (blocked) {
    const stopped = stopReport(reports, current.id, blocked);
    await ctx.persist(stopped);
    return { reports: stopped, action: 'progress', waitMs: null };
  }

  let working = replace(reports, current.id, report => ({
    ...report,
    status: 'uploading',
    lastError: null,
  }));
  await ctx.persist(working);

  if (!current.serverRecord) {
    let result: TransferResult;
    try {
      result = await ctx.transport.ensureReport({
        id: current.id,
        description: current.description,
        imageIds: current.images.map(image => image.id),
      });
    } catch {
      result = { kind: 'retry', reason: 'The connection dropped. Will try again.' };
    }
    const outcome = applyTransfer(result.kind);
    if (outcome === 'retry') {
      working = scheduleRetry(working, current.id, result.kind === 'retry' ? result.reason : 'Will try again.', ctx.now());
      await ctx.persist(working);
      return { reports: working, action: 'progress', waitMs: null };
    }
    if (outcome === 'stop') {
      working = stopReport(working, current.id, result.kind === 'stop' ? result.reason : 'Stopped.');
      await ctx.persist(working);
      return { reports: working, action: 'progress', waitMs: null };
    }
    working = replace(working, current.id, report => ({ ...report, serverRecord: true }));
    await ctx.persist(working);
  }

  const report = working.find(item => item.id === current.id)!;
  const image = report.images.find(item => item.status !== 'stored');
  if (!image) {
    working = replace(working, current.id, item => ({
      ...item,
      status: 'uploaded',
      serverAckAt: new Date(ctx.now()).toISOString(),
      nextAttemptAt: null,
      lastError: null,
    }));
    await ctx.persist(working);
    return { reports: working, action: 'progress', waitMs: null };
  }

  working = replace(working, current.id, item => ({
    ...item,
    images: item.images.map(candidate =>
      candidate.id === image.id ? { ...candidate, status: 'uploading', bytesSent: 0 } : candidate,
    ),
  }));
  await ctx.persist(working);

  let result: TransferResult;
  try {
    result = await ctx.transport.uploadImage({
      reportId: current.id,
      imageId: image.id,
      fileUri: image.fileUri,
      onProgress: bytesSent => ctx.onProgress?.(current.id, image.id, bytesSent),
    });
  } catch {
    result = { kind: 'retry', reason: 'The connection dropped. Will try again.' };
  }

  const outcome = applyTransfer(result.kind);
  if (outcome === 'retry') {
    const reason = result.kind === 'retry' ? result.reason : 'Will try again.';
    working = scheduleRetry(working, current.id, reason, ctx.now());
    if (result.kind === 'retry' && result.code === 'missing') {
      working = replace(working, current.id, item => ({ ...item, serverRecord: false }));
    }
    await ctx.persist(working);
    return { reports: working, action: 'progress', waitMs: null };
  }
  if (outcome === 'stop') {
    working = stopReport(working, current.id, result.kind === 'stop' ? result.reason : 'Stopped.');
    await ctx.persist(working);
    return { reports: working, action: 'progress', waitMs: null };
  }

  working = replace(working, current.id, item => {
    const images = item.images.map(candidate =>
      candidate.id === image.id
        ? { ...candidate, status: 'stored' as const, bytesSent: candidate.byteSize }
        : candidate,
    );
    const done = images.every(candidate => candidate.status === 'stored');
    return {
      ...item,
      images,
      status: done ? 'uploaded' : 'uploading',
      serverAckAt: done ? new Date(ctx.now()).toISOString() : item.serverAckAt,
      nextAttemptAt: null,
      lastError: null,
      attempts: done ? item.attempts : item.attempts,
    };
  });
  await ctx.persist(working);
  return { reports: working, action: 'progress', waitMs: null };
}

/** Keep calling until the queue is idle or waiting. No React, no screen. */
export async function drain(reports: LocalReport[], ctx: PumpContext): Promise<LocalReport[]> {
  let current = reports;
  for (let step = 0; step < 100; step += 1) {
    const outcome = await pumpOnce(current, ctx);
    current = outcome.reports;
    if (outcome.action !== 'progress') {
      return current;
    }
  }
  return current;
}
