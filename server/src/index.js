import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 5 * 1024 * 1024;
const MODES = ['off', 'slow', 'drop', 'refuse', 'hang'];

/**
 * Demo sink for field reports.
 * The same report id and image id always land once.
 * POST /v1/fault makes the next upload slow, drop, refuse, or hang.
 */
export function createApp({ root, slowMs = 8000 } = {}) {
  if (!root) {
    throw new Error('createApp needs a data root');
  }
  fs.mkdirSync(root, { recursive: true });
  const dbPath = path.join(root, 'reports.json');
  const imageRoot = path.join(root, 'images');
  fs.mkdirSync(imageRoot, { recursive: true });

  const fault = { mode: 'off', left: 0 };

  function readDb() {
    if (!fs.existsSync(dbPath)) {
      return { reports: [] };
    }
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }

  function writeDb(db) {
    const tmp = `${dbPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dbPath);
  }

  function imagePath(reportId, imageId) {
    return path.join(imageRoot, reportId, `${imageId}.jpg`);
  }

  function takeFault(req) {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return null;
    }
    if (fault.mode === 'off' || fault.left <= 0) {
      return null;
    }
    const mode = fault.mode;
    fault.left -= 1;
    if (fault.left <= 0) {
      fault.mode = 'off';
    }
    return mode;
  }

  function faultGate(req, res, next) {
    const mode = takeFault(req);
    if (!mode) {
      return next();
    }
    console.log(`[field-reports] fault ${mode} ${req.method} ${req.path}`);
    if (mode === 'refuse') {
      return res.status(503).json({ error: 'refused' });
    }
    if (mode === 'hang') {
      return undefined;
    }
    if (mode === 'slow') {
      setTimeout(next, slowMs);
      return undefined;
    }
    const drop = () => {
      req.socket.destroy();
    };
    req.on('data', drop);
    req.on('end', drop);
    return undefined;
  }

  function publicReport(report, req) {
    const host = req.get('host');
    const images = report.images.map(image => ({
      id: image.id,
      stored: image.stored,
      bytes: image.bytes,
      url: `http://${host}/v1/images/${report.id}/${image.id}`,
    }));
    return {
      id: report.id,
      description: report.description,
      createdAt: report.createdAt,
      complete: images.length > 0 && images.every(image => image.stored),
      images,
    };
  }

  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/v1/fault', (_req, res) => {
    res.json(fault);
  });

  app.post('/v1/fault', express.json(), (req, res) => {
    const mode = req.body?.mode ?? 'off';
    if (!MODES.includes(mode)) {
      return res.status(400).json({ error: 'bad_mode' });
    }
    const requests = mode === 'off' ? 0 : Number(req.body?.requests ?? 1);
    if (!Number.isInteger(requests) || requests < 0 || requests > 20) {
      return res.status(400).json({ error: 'bad_requests' });
    }
    fault.mode = mode;
    fault.left = requests;
    console.log(`[field-reports] next ${requests} upload(s): ${mode}`);
    return res.json(fault);
  });

  app.get('/v1/reports', (req, res) => {
    const db = readDb();
    res.json({ reports: db.reports.map(report => publicReport(report, req)) });
  });

  app.get('/v1/reports/:id', (req, res) => {
    const db = readDb();
    const report = db.reports.find(item => item.id === req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'missing' });
    }
    return res.json({ report: publicReport(report, req) });
  });

  app.post('/v1/reports', faultGate, express.json({ limit: '1mb' }), (req, res) => {
    const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const images = Array.isArray(req.body?.images) ? req.body.images : null;
    if (!id || !description || !images) {
      return res.status(422).json({ error: 'invalid' });
    }
    if (description.length > 400) {
      return res.status(422).json({ error: 'description_length' });
    }
    if (images.length < 1 || images.length > 5) {
      return res.status(422).json({ error: 'image_count' });
    }
    const imageIds = images.map(image => image?.id).filter(imageId => typeof imageId === 'string' && imageId.trim());
    if (imageIds.length !== images.length || new Set(imageIds).size !== imageIds.length) {
      return res.status(422).json({ error: 'image_ids' });
    }

    const db = readDb();
    const existing = db.reports.find(report => report.id === id);
    if (existing) {
      console.log(`[field-reports] report ${id} already stored`);
      return res.status(200).json({ report: publicReport(existing, req), duplicate: true });
    }

    const report = {
      id,
      description,
      createdAt: new Date().toISOString(),
      images: imageIds.map(imageId => ({ id: imageId, stored: false, bytes: 0 })),
    };
    db.reports.push(report);
    writeDb(db);
    console.log(`[field-reports] report ${id} created`);
    return res.status(201).json({ report: publicReport(report, req), duplicate: false });
  });

  app.put(
    '/v1/reports/:reportId/images/:imageId',
    faultGate,
    express.raw({ type: '*/*', limit: '8mb' }),
    (req, res) => {
      const { reportId, imageId } = req.params;
      const db = readDb();
      const report = db.reports.find(item => item.id === reportId);
      if (!report) {
        return res.status(404).json({ error: 'missing_report' });
      }
      const image = report.images.find(item => item.id === imageId);
      if (!image) {
        return res.status(404).json({ error: 'missing_image' });
      }
      const file = imagePath(reportId, imageId);
      if (image.stored && fs.existsSync(file)) {
        console.log(`[field-reports] image ${imageId} already stored`);
        return res.status(200).json({ stored: true, duplicate: true, bytes: image.bytes });
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (body.length === 0 || body.length > MAX_BYTES) {
        return res.status(413).json({ error: 'too_large' });
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, file);
      image.stored = true;
      image.bytes = body.length;
      writeDb(db);
      console.log(`[field-reports] image ${imageId} stored ${body.length} bytes`);
      return res.status(201).json({ stored: true, duplicate: false, bytes: body.length });
    },
  );

  app.get('/v1/images/:reportId/:imageId', (req, res) => {
    const file = imagePath(req.params.reportId, req.params.imageId);
    if (!fs.existsSync(file)) {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', 'image/jpeg');
    return fs.createReadStream(file).pipe(res);
  });

  app.delete('/v1/reports', (_req, res) => {
    writeDb({ reports: [] });
    fs.rmSync(imageRoot, { recursive: true, force: true });
    fs.mkdirSync(imageRoot, { recursive: true });
    console.log('[field-reports] server reports deleted');
    res.json({ deleted: true });
  });

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const port = Number(process.env.PORT || 8787);
  const app = createApp({ root });
  http.createServer(app).listen(port, '0.0.0.0', () => {
    console.log(`[field-reports] listening on http://0.0.0.0:${port}`);
  });
}
