export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageStatus = 'pending' | 'uploading' | 'stored';

export type ReportStatus = 'queued' | 'uploading' | 'uploaded' | 'needs_you';

export type LocalImage = {
  id: string;
  fileUri: string;
  byteSize: number;
  status: ImageStatus;
  bytesSent: number;
};

/** A report that already survived a save to disk. Uploaded is a later fact. */
export type LocalReport = {
  id: string;
  description: string;
  createdAt: string;
  status: ReportStatus;
  serverRecord: boolean;
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  serverAckAt: string | null;
  images: LocalImage[];
};

export type TransferResult =
  | { kind: 'ok' }
  | { kind: 'already' }
  | { kind: 'retry'; reason: string; code?: 'missing' }
  | { kind: 'stop'; reason: string };

export type ServerImage = {
  id: string;
  stored: boolean;
  bytes: number;
  url: string;
};

export type ServerReport = {
  id: string;
  description: string;
  createdAt: string;
  complete: boolean;
  images: ServerImage[];
};

export type Transport = {
  ensureReport: (input: { id: string; description: string; imageIds: string[] }) => Promise<TransferResult>;
  uploadImage: (input: {
    reportId: string;
    imageId: string;
    fileUri: string;
    onProgress: (bytesSent: number) => void;
  }) => Promise<TransferResult>;
};

export type PumpContext = {
  now: () => number;
  online: () => boolean;
  transport: Transport;
  persist: (reports: LocalReport[]) => Promise<void>;
  onProgress?: (reportId: string, imageId: string, bytesSent: number) => void;
};

export type PumpOutcome = {
  reports: LocalReport[];
  action: 'idle' | 'wait' | 'progress';
  waitMs: number | null;
};
