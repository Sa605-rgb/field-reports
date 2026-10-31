import ReactNativeBlobUtil from 'react-native-blob-util';

import { ensureDir, stripFileScheme } from './files';

export async function copyPhoto(sourceUri: string, destPath: string, hintedBytes?: number): Promise<number> {
  await ensureDir(destPath.slice(0, destPath.lastIndexOf('/')));
  const from = stripFileScheme(sourceUri);
  if (await ReactNativeBlobUtil.fs.exists(destPath)) {
    await ReactNativeBlobUtil.fs.unlink(destPath);
  }
  await ReactNativeBlobUtil.fs.cp(from, destPath);
  const stat = await ReactNativeBlobUtil.fs.stat(destPath);
  const bytes = Number(stat.size);
  if (Number.isFinite(bytes) && bytes > 0) {
    return bytes;
  }
  if (hintedBytes && hintedBytes > 0) {
    return hintedBytes;
  }
  throw new Error('That photo could not be kept on this phone.');
}
