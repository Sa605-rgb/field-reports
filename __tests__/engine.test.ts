import { drain, pumpOnce } from '../src/engine/engine';
import { backoffMs, classifyHttp, recover, validateDraft } from '../src/engine/policy';
import { statusLine } from '../src/engine/status';
import type { LocalReport, PumpContext, TransferResult } from '../src/engine/types';
import { MAX_IMAGE_BYTES } from '../src/engine/types';
import { afterAttempt, firstCompressStep } from '../src/images/budget';

function report(overrides: Partial<LocalReport> = {}): LocalReport {
  return {
    id: 'report-1',
    description: 'Crack in the stairwell',
    createdAt: '2026-10-30T10:00:00.000Z',
    status: 'queued',
    serverRecord: false,
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    serverAckAt: null,
    images: [
      { id: 'img-1', fileUri: 'file:///img-1.jpg', byteSize: 1200, status: 'pending', bytesSent: 0 },
      { id: 'img-2', fileUri: 'file:///img-2.jpg', byteSize: 1400, status: 'pending', bytesSent: 0 },
    ],
    ...overrides,
  };
}

function context(partial: {
  transport: PumpContext['transport'];
  online?: boolean;
  now?: number;
  persist?: (reports: LocalReport[]) => Promise<void>;
}): { ctx: PumpContext; snaps: LocalReport[][]; time: { value: number } } {
  const snaps: LocalReport[][] = [];
  const time = { value: partial.now ?? 1_000_000 };
  const ctx: PumpContext = {
    now: () => time.value,
    online: () => partial.online ?? true,
    transport: partial.transport,
    persist: async reports => {
      snaps.push(reports);
      await partial.persist?.(reports);
    },
  };
  return { ctx, snaps, time };
}

describe('delivery rules', () => {
  it('does not call the network while offline', async () => {
    const ensureReport = jest.fn(async () => ({ kind: 'ok' }) as TransferResult);
    const uploadImage = jest.fn(async () => ({ kind: 'ok' }) as TransferResult);
    const { ctx } = context({ transport: { ensureReport, uploadImage }, online: false });
    const outcome = await pumpOnce([report()], ctx);
    expect(outcome.action).toBe('wait');
    expect(ensureReport).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(statusLine(outcome.reports[0], false, 1_000_000).title).toBe('Saved on this phone');
  });

  it('refuses a photo over 5 MB before any request', async () => {
    const ensureReport = jest.fn(async () => ({ kind: 'ok' }) as TransferResult);
    const uploadImage = jest.fn(async () => ({ kind: 'ok' }) as TransferResult);
    const { ctx } = context({ transport: { ensureReport, uploadImage } });
    const tooBig = report({
      images: [{ id: 'img-1', fileUri: 'file:///big.jpg', byteSize: MAX_IMAGE_BYTES + 1, status: 'pending', bytesSent: 0 }],
    });
    const outcome = await pumpOnce([tooBig], ctx);
    expect(outcome.reports[0].status).toBe('needs_you');
    expect(ensureReport).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('lands every image once, then a second pass does nothing', async () => {
    const seen = new Set<string>();
    let uploads = 0;
    const { ctx } = context({
      transport: {
        ensureReport: async () => ({ kind: 'ok' }),
        uploadImage: async input => {
          uploads += 1;
          if (seen.has(input.imageId)) {
            return { kind: 'already' };
          }
          seen.add(input.imageId);
          return { kind: 'ok' };
        },
      },
    });
    const done = await drain([report()], ctx);
    expect(done[0].status).toBe('uploaded');
    expect(uploads).toBe(2);
    const again = await drain(done, ctx);
    expect(again[0].status).toBe('uploaded');
    expect(uploads).toBe(2);
  });

  it('keeps the in-flight photo after a kill, then finishes without a duplicate', async () => {
    const stored = new Set<string>();
    const first = context({
      transport: {
        ensureReport: async () => ({ kind: 'ok' }),
        uploadImage: async input => {
          stored.add(input.imageId);
          throw new Error('response lost');
        },
      },
    });
    await pumpOnce([report()], first.ctx);
    const snapshot = first.snaps.find(item => item[0]?.images[0]?.status === 'uploading');
    expect(snapshot?.[0].images[0].status).toBe('uploading');
    const recovered = recover(snapshot ?? []);
    expect(recovered[0].status).toBe('queued');
    expect(recovered[0].images[0].status).toBe('pending');

    const second = context({
      transport: {
        ensureReport: async () => ({ kind: 'already' }),
        uploadImage: async input => {
          if (stored.has(input.imageId)) {
            return { kind: 'already' };
          }
          stored.add(input.imageId);
          return { kind: 'ok' };
        },
      },
    });
    const done = await drain(recovered, second.ctx);
    expect(done[0].status).toBe('uploaded');
    expect(stored.size).toBe(2);
  });

  it('retries a refused upload and stops on a rejection', async () => {
    const { ctx, time } = context({
      transport: {
        ensureReport: async () => ({ kind: 'retry', reason: 'Server answered 503. Will try again.' }),
        uploadImage: async () => ({ kind: 'ok' }),
      },
    });
    const refused = await pumpOnce([report()], ctx);
    expect(refused.reports[0].status).toBe('queued');
    expect(refused.reports[0].attempts).toBe(1);
    expect(refused.reports[0].nextAttemptAt).toBe(time.value + backoffMs(1));

    time.value += backoffMs(1);
    const stoppedCtx = context({
      now: time.value,
      transport: {
        ensureReport: async () => ({ kind: 'stop', reason: 'The server rejected this report (422).' }),
        uploadImage: jest.fn(async () => ({ kind: 'ok' }) as TransferResult),
      },
    });
    const stopped = await pumpOnce(refused.reports, stoppedCtx.ctx);
    expect(stopped.reports[0].status).toBe('needs_you');
    const later = await pumpOnce(stopped.reports, { ...stoppedCtx.ctx, now: () => time.value + 999_999 });
    expect(later.action).toBe('idle');
    expect(stoppedCtx.ctx.transport.uploadImage).not.toHaveBeenCalled();
  });

  it('waits out the backoff instead of hammering the server', async () => {
    const ensureReport = jest.fn(async () => ({ kind: 'ok' }) as TransferResult);
    const { ctx, time } = context({
      transport: { ensureReport, uploadImage: async () => ({ kind: 'ok' }) },
    });
    const queued = report({ attempts: 1, nextAttemptAt: time.value + 5_000 });
    const waiting = await pumpOnce([queued], ctx);
    expect(waiting.action).toBe('wait');
    expect(waiting.waitMs).toBe(5_000);
    expect(ensureReport).not.toHaveBeenCalled();
  });

  it('uploads three reports once each', async () => {
    const ids: string[] = [];
    const { ctx } = context({
      transport: {
        ensureReport: async input => {
          ids.push(input.id);
          return { kind: 'ok' };
        },
        uploadImage: async () => ({ kind: 'ok' }),
      },
    });
    const reports = [report({ id: 'a' }), report({ id: 'b', createdAt: '2026-10-30T10:01:00.000Z' }), report({ id: 'c', createdAt: '2026-10-30T10:02:00.000Z' })];
    const done = await drain(reports, ctx);
    expect(done.map(item => item.status)).toEqual(['uploaded', 'uploaded', 'uploaded']);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('words on screen', () => {
  it('never calls a queued report uploaded', () => {
    const line = statusLine(report(), true, 1_000_000);
    expect(line.title).toBe('Saved on this phone');
    expect(line.detail).not.toMatch(/uploaded/i);
    expect(validateDraft('  ', 1)).toMatch(/blank/i);
    expect(validateDraft('Crack', 0)).toMatch(/at least one/i);
    expect(validateDraft('Crack', 6)).toMatch(/at most 5/i);
    expect(validateDraft('Crack', 3)).toBeNull();
  });
});

describe('http and photos', () => {
  it('retries only the failures that are not the report\'s fault', () => {
    expect(classifyHttp(201, false).kind).toBe('ok');
    expect(classifyHttp(200, true).kind).toBe('already');
    expect(classifyHttp(503, false).kind).toBe('retry');
    expect(classifyHttp(404, false)).toMatchObject({ kind: 'retry', code: 'missing' });
    expect(classifyHttp(413, false).kind).toBe('stop');
    expect(classifyHttp(422, false).kind).toBe('stop');
  });

  it('shrinks an 18 MB photo until it fits, then stops', () => {
    const eighteenMb = 18 * 1024 * 1024;
    expect(firstCompressStep().maxEdge).toBe(2560);
    const stillBig = afterAttempt(eighteenMb, 0);
    expect(stillBig.action).toBe('again');
    expect(afterAttempt(4 * 1024 * 1024, 0).action).toBe('ready');
    expect(afterAttempt(eighteenMb, 4).action).toBe('give-up');
  });
});
