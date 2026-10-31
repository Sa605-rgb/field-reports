import { MAX_IMAGE_BYTES } from '../engine/types';

export type CompressStep = {
  maxEdge: number;
  quality: number;
};

/** Each step is still a photograph, not a thumbnail. Stop as soon as the file is under 5 MB. */
export const COMPRESS_STEPS: CompressStep[] = [
  { maxEdge: 2560, quality: 82 },
  { maxEdge: 2048, quality: 75 },
  { maxEdge: 1600, quality: 68 },
  { maxEdge: 1280, quality: 60 },
  { maxEdge: 1024, quality: 52 },
];

export type CompressPlan =
  | { action: 'ready' }
  | { action: 'again'; step: CompressStep }
  | { action: 'give-up' };

export function firstCompressStep(): CompressStep {
  return COMPRESS_STEPS[0];
}

export function afterAttempt(byteSize: number, stepIndex: number): CompressPlan {
  if (byteSize <= MAX_IMAGE_BYTES) {
    return { action: 'ready' };
  }
  const step = COMPRESS_STEPS[stepIndex + 1];
  if (!step) {
    return { action: 'give-up' };
  }
  return { action: 'again', step };
}
