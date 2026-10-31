import type { LocalReport } from './types';

export type Tone = 'wait' | 'move' | 'safe' | 'stop';

export type StatusLine = {
  tone: Tone;
  title: string;
  detail: string;
};

/**
 * Saved and uploaded are different facts.
 * This sentence is only about the phone's queue, never about a guess.
 */
export function statusLine(report: LocalReport, online: boolean, now: number): StatusLine {
  if (report.status === 'uploaded') {
    return {
      tone: 'safe',
      title: 'On the server',
      detail: 'The server accepted every photo in this report.',
    };
  }
  if (report.status === 'needs_you') {
    return {
      tone: 'stop',
      title: 'Stopped',
      detail: report.lastError ?? 'This report will not be retried.',
    };
  }
  const stored = report.images.filter(image => image.status === 'stored').length;
  const total = report.images.length;
  if (!online) {
    return {
      tone: 'wait',
      title: 'Saved on this phone',
      detail:
        stored > 0
          ? `${stored} of ${total} photos are already on the server. The rest are waiting for a connection.`
          : 'Waiting for a connection. Nothing from this report has been uploaded.',
    };
  }
  if (report.status === 'uploading') {
    return {
      tone: 'move',
      title: 'Uploading',
      detail: `${stored} of ${total} photos are on the server.`,
    };
  }
  if (report.nextAttemptAt != null && report.nextAttemptAt > now) {
    const seconds = Math.max(1, Math.ceil((report.nextAttemptAt - now) / 1000));
    return {
      tone: 'wait',
      title: 'Saved on this phone',
      detail: `${report.lastError ?? 'The last try failed.'} Next try in ${seconds}s.`,
    };
  }
  return {
    tone: 'wait',
    title: 'Saved on this phone',
    detail:
      stored > 0
        ? `${stored} of ${total} photos are on the server. The rest are queued.`
        : 'Queued on this phone. Not on the server yet.',
  };
}
