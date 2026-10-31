import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createApp } from '../src/index.js';

const MAX_BYTES = 5 * 1024 * 1024;

async function withServer(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'field-reports-'));
  const app = createApp({ root, slowMs: 50 });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function reportBody(id = 'report-1') {
  return {
    id,
    description: 'Crack in the stairwell',
    images: [{ id: 'img-1' }, { id: 'img-2' }],
  };
}

test('the same report id is stored once', async () => {
  await withServer(async base => {
    const first = await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportBody()),
    });
    assert.equal(first.status, 201);
    const second = await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportBody()),
    });
    assert.equal(second.status, 200);
    const body = await second.json();
    assert.equal(body.duplicate, true);
    const list = await fetch(`${base}/v1/reports`);
    const listed = await list.json();
    assert.equal(listed.reports.length, 1);
  });
});

test('the same image is stored once and a sixth image is refused', async () => {
  await withServer(async base => {
    await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportBody()),
    });
    const bytes = Buffer.alloc(32_000, 7);
    const put = () =>
      fetch(`${base}/v1/reports/report-1/images/img-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
    const first = await put();
    assert.equal(first.status, 201);
    const second = await put();
    const duplicate = await second.json();
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.bytes, bytes.length);

    const tooMany = await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'report-2',
        description: 'Too many',
        images: [1, 2, 3, 4, 5, 6].map(n => ({ id: `img-${n}` })),
      }),
    });
    assert.equal(tooMany.status, 422);

    const blank = await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'report-3', description: '   ', images: [{ id: 'img-9' }] }),
    });
    assert.equal(blank.status, 422);
  });
});

test('a photo over 5 MB is rejected and not kept', async () => {
  await withServer(async base => {
    await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportBody()),
    });
    const huge = Buffer.alloc(MAX_BYTES + 10, 1);
    const response = await fetch(`${base}/v1/reports/report-1/images/img-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: huge,
    });
    assert.equal(response.status, 413);
    const follow = await fetch(`${base}/v1/reports/report-1`);
    const body = await follow.json();
    assert.equal(body.report.images[0].stored, false);
  });
});

test('refuse, drop, and hang fail the attempt and the next one can succeed', async () => {
  await withServer(async base => {
    await fetch(`${base}/v1/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'refuse', requests: 1 }),
    });
    const refused = await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportBody()),
    });
    assert.equal(refused.status, 503);
    const created = await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportBody()),
    });
    assert.equal(created.status, 201);

    await fetch(`${base}/v1/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'drop', requests: 1 }),
    });
    await assert.rejects(() =>
      fetch(`${base}/v1/reports/report-1/images/img-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.alloc(8_000, 3),
      }),
    );
    const stored = await fetch(`${base}/v1/reports/report-1/images/img-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.alloc(8_000, 3),
    });
    assert.equal(stored.status, 201);

    await fetch(`${base}/v1/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'hang', requests: 1 }),
    });
    await assert.rejects(() =>
      fetch(`${base}/v1/reports/report-1/images/img-2`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.alloc(1000, 2),
        signal: AbortSignal.timeout(300),
      }),
    );
    const afterHang = await fetch(`${base}/v1/reports/report-1/images/img-2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.alloc(1000, 2),
    });
    assert.equal(afterHang.status, 201);
    const detail = await fetch(`${base}/v1/reports/report-1`);
    const body = await detail.json();
    assert.equal(body.report.complete, true);
  });
});
