import { MAX_IMAGE_BYTES, type LocalReport, type TransferResult } from './types';

const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export function backoffMs(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

/** What a finished HTTP response means. Network drops never reach this. */
export function classifyHttp(status: number, duplicate: boolean): TransferResult {
  if (status === 200 || status === 201) {
    return duplicate ? { kind: 'already' } : { kind: 'ok' };
  }
  if (status === 408 || status === 429 || status >= 500) {
    return { kind: 'retry', reason: `Server answered ${status}. Will try again.` };
  }
  if (status === 404) {
    return { kind: 'retry', code: 'missing', reason: 'The server did not have this yet. Will try again.' };
  }
  if (status === 413) {
    return { kind: 'stop', reason: 'A photo was over 5 MB. It was not sent.' };
  }
  return { kind: 'stop', reason: `The server rejected this report (${status}).` };
}

export function validateDraft(description: string, imageCount: number): string | null {
  if (!description.trim()) {
    return 'Write what you saw. A blank report cannot be saved.';
  }
  if (description.trim().length > 400) {
    return 'Keep it short. 400 characters is the limit.';
  }
  if (imageCount < 1) {
    return 'Add at least one photo.';
  }
  if (imageCount > 5) {
    return 'A report holds at most 5 photos.';
  }
  return null;
}

export function recover(reports: LocalReport[]): LocalReport[] {
  return reports.map(report => {
    const images = report.images.map(image =>
      image.status === 'uploading' ? { ...image, status: 'pending' as const, bytesSent: 0 } : image,
    );
    if (report.status === 'needs_you') {
      return { ...report, images };
    }
    const allStored = images.length > 0 && images.every(image => image.status === 'stored');
    if (allStored) {
      return { ...report, images, status: 'uploaded' };
    }
    if (report.status === 'uploaded') {
      return { ...report, images, status: 'queued' };
    }
    return { ...report, images, status: 'queued' };
  });
}

export function assertSendable(report: LocalReport): string | null {
  const draftError = validateDraft(report.description, report.images.length);
  if (draftError) {
    return draftError;
  }
  const oversized = report.images.find(image => image.byteSize <= 0 || image.byteSize > MAX_IMAGE_BYTES);
  if (oversized) {
    return 'A photo was over 5 MB. It was not sent.';
  }
  return null;
}
