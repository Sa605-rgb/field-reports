import ImageResizer from '@bam.tech/react-native-image-resizer';
import ReactNativeBlobUtil from 'react-native-blob-util';

import { MAX_IMAGE_BYTES } from '../engine/types';
import { afterAttempt, firstCompressStep, type CompressStep } from './budget';
import { ensureDir, stripFileScheme, toFileUri } from '../storage/files';

const fs = ReactNativeBlobUtil.fs;

async function fileBytes(path: string): Promise<number> {
  const stat = await fs.stat(path);
  return Number(stat.size);
}

async function copyFile(sourceUri: string, destPath: string): Promise<void> {
  await ensureDir(destPath.slice(0, destPath.lastIndexOf('/')));
  const from = stripFileScheme(sourceUri);
  if (await fs.exists(destPath)) {
    await fs.unlink(destPath);
  }
  await fs.cp(from, destPath);
}

async function resize(sourceUri: string, step: CompressStep): Promise<{ uri: string; bytes: number; path: string }> {
  const resized = await ImageResizer.createResizedImage(
    sourceUri,
    step.maxEdge,
    step.maxEdge,
    'JPEG',
    step.quality,
    0,
    undefined,
    false,
    { mode: 'contain', onlyScaleDown: true },
  );
  return { uri: resized.uri, bytes: resized.size, path: resized.path };
}

/**
 * Copies a photo into app storage, shrinking it until it is under 5 MB.
 * The original camera file is never what gets uploaded.
 */
export async function preparePhoto(sourceUri: string, sourceBytes: number, destPath: string): Promise<{ uri: string; bytes: number }> {
  if (sourceBytes > 0 && sourceBytes <= MAX_IMAGE_BYTES) {
    await copyFile(sourceUri, destPath);
    const bytes = await fileBytes(destPath);
    if (bytes > 0 && bytes <= MAX_IMAGE_BYTES) {
      return { uri: toFileUri(destPath), bytes };
    }
  }

  let source = sourceUri;
  let step = firstCompressStep();
  let stepIndex = 0;
  let lastPath: string | null = null;

  while (true) {
    const resized = await resize(source, step);
    if (lastPath && lastPath !== stripFileScheme(sourceUri)) {
      await fs.unlink(lastPath).catch(() => undefined);
    }
    lastPath = resized.path;
    const plan = afterAttempt(resized.bytes, stepIndex);
    if (plan.action === 'ready') {
      await copyFile(resized.uri, destPath);
      await fs.unlink(resized.path).catch(() => undefined);
      const bytes = await fileBytes(destPath);
      if (bytes <= 0 || bytes > MAX_IMAGE_BYTES) {
        throw new Error('A photo was over 5 MB. It was not saved.');
      }
      return { uri: toFileUri(destPath), bytes };
    }
    if (plan.action === 'give-up') {
      await fs.unlink(resized.path).catch(() => undefined);
      throw new Error('A photo was over 5 MB. It was not saved.');
    }
    source = resized.uri;
    step = plan.step;
    stepIndex += 1;
  }
}
