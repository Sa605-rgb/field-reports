import ReactNativeBlobUtil from 'react-native-blob-util';

import type { LocalReport } from '../engine/types';

const fs = ReactNativeBlobUtil.fs;

export function documentDir(): string {
  return fs.dirs.DocumentDir;
}

export function queuePath(): string {
  return `${documentDir()}/queue.json`;
}

export function reportDir(reportId: string): string {
  return `${documentDir()}/reports/${reportId}`;
}

export function draftPath(imageId: string): string {
  return `${documentDir()}/drafts/${imageId}.jpg`;
}

export function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

export function toFileUri(path: string): string {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
}

export async function ensureDir(dir: string): Promise<void> {
  if (await fs.exists(dir)) {
    return;
  }
  const parent = dir.slice(0, dir.lastIndexOf('/'));
  if (parent && parent !== dir) {
    await ensureDir(parent);
  }
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir);
  }
}

export async function readQueue(): Promise<LocalReport[]> {
  const path = queuePath();
  if (!(await fs.exists(path))) {
    return [];
  }
  const text = await fs.readFile(path, 'utf8');
  const parsed = JSON.parse(text) as LocalReport[];
  if (!Array.isArray(parsed)) {
    throw new Error('Queue file was not a list.');
  }
  return parsed;
}

let writeChain: Promise<void> = Promise.resolve();

export function saveQueue(reports: LocalReport[]): Promise<void> {
  const run = writeChain.then(async () => {
    const path = queuePath();
    const tmp = `${path}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(reports), 'utf8');
    if (await fs.exists(path)) {
      await fs.unlink(path);
    }
    await fs.mv(tmp, path);
  });
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function removeFile(uri: string): Promise<void> {
  const path = stripFileScheme(uri);
  if (await fs.exists(path)) {
    await fs.unlink(path);
  }
}

export async function removeReportFiles(reportId: string): Promise<void> {
  const dir = reportDir(reportId);
  if (!(await fs.exists(dir))) {
    return;
  }
  const names = await fs.ls(dir);
  await Promise.all(names.map(name => fs.unlink(`${dir}/${name}`).catch(() => undefined)));
}
