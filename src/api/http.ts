import ReactNativeBlobUtil from 'react-native-blob-util';

import { API_URL, JSON_TIMEOUT_MS, STALL_MS } from '../config';
import { classifyHttp } from '../engine/policy';
import type { ServerReport, TransferResult, Transport } from '../engine/types';
import { stripFileScheme } from '../storage/files';

type FaultMode = 'off' | 'slow' | 'drop' | 'refuse' | 'hang';

async function requestJson(path: string, init: RequestInit, timeoutMs = JSON_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function asTransfer(response: Response): Promise<TransferResult> {
  let duplicate = false;
  try {
    const body = await response.json();
    duplicate = Boolean(body?.duplicate);
  } catch {
    duplicate = false;
  }
  return classifyHttp(response.status, duplicate);
}

function networkRetry(error: unknown): TransferResult {
  if (error instanceof Error && error.name === 'AbortError') {
    return { kind: 'retry', reason: 'No response from the server. Will try again.' };
  }
  return { kind: 'retry', reason: 'The connection dropped. Will try again.' };
}

export function createTransport(): Transport {
  return {
    async ensureReport(input) {
      try {
        const response = await requestJson('/v1/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            id: input.id,
            description: input.description,
            images: input.imageIds.map(id => ({ id })),
          }),
        });
        return asTransfer(response);
      } catch (error) {
        return networkRetry(error);
      }
    },
    uploadImage(input) {
      const path = stripFileScheme(input.fileUri);
      const url = `${API_URL}/v1/reports/${input.reportId}/images/${input.imageId}`;
      return new Promise(resolve => {
        let settled = false;
        let lastMove = Date.now();
        const task = ReactNativeBlobUtil.fetch(
          'PUT',
          url,
          { 'Content-Type': 'application/octet-stream', Accept: 'application/json' },
          ReactNativeBlobUtil.wrap(path),
        );
        task.uploadProgress({ interval: 400 }, written => {
          lastMove = Date.now();
          input.onProgress(written);
        });
        const timer = setInterval(() => {
          if (settled || Date.now() - lastMove < STALL_MS) {
            return;
          }
          settled = true;
          clearInterval(timer);
          task.cancel();
          resolve({ kind: 'retry', reason: 'No response from the server. Will try again.' });
        }, 1000);
        task
          .then(response => {
            if (settled) {
              return;
            }
            settled = true;
            clearInterval(timer);
            const info = response.info();
            let duplicate = false;
            try {
              duplicate = Boolean(response.json()?.duplicate);
            } catch {
              duplicate = false;
            }
            resolve(classifyHttp(info.status, duplicate));
          })
          .catch(error => {
            if (settled) {
              return;
            }
            settled = true;
            clearInterval(timer);
            resolve(networkRetry(error));
          });
      });
    },
  };
}

export async function fetchReports(): Promise<ServerReport[]> {
  const response = await requestJson('/v1/reports', { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`The server answered ${response.status}.`);
  }
  const body = await response.json();
  return body.reports as ServerReport[];
}

export async function fetchReport(id: string): Promise<ServerReport> {
  const response = await requestJson(`/v1/reports/${id}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'The server does not have this report.' : `The server answered ${response.status}.`);
  }
  const body = await response.json();
  return body.report as ServerReport;
}

export async function setFault(mode: FaultMode, requests: number): Promise<string> {
  const response = await requestJson('/v1/fault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ mode, requests }),
  });
  if (!response.ok) {
    throw new Error('Could not change the server.');
  }
  const body = await response.json();
  if (body.mode === 'off') {
    return 'The server will answer normally.';
  }
  return `The next ${body.left} upload request(s) will ${body.mode}.`;
}
