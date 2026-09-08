import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PLAN_PATH = path.join(DATA_DIR, 'plan.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 50;
const PORT = 5175;

async function ensureDirs() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(BACKUPS_DIR, { recursive: true });
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds())}`;
}

async function pruneBackups() {
  const files = (await readdir(BACKUPS_DIR)).filter((f) => f.endsWith('.json'));
  if (files.length <= MAX_BACKUPS) return;
  const withStats = await Promise.all(
    files.map(async (f) => ({ f, mtime: (await stat(path.join(BACKUPS_DIR, f))).mtimeMs }))
  );
  withStats.sort((a, b) => a.mtime - b.mtime);
  const toDelete = withStats.slice(0, withStats.length - MAX_BACKUPS);
  await Promise.all(toDelete.map((x) => unlink(path.join(BACKUPS_DIR, x.f))));
}

async function backupCurrentPlan() {
  try {
    const current = await readFile(PLAN_PATH, 'utf-8');
    await writeFile(path.join(BACKUPS_DIR, `plan-${timestamp()}.json`), current, 'utf-8');
    await pruneBackups();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      send(res, 204, undefined);
      return;
    }
    if (req.url === '/api/plan' && req.method === 'GET') {
      const raw = await readFile(PLAN_PATH, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(raw);
      return;
    }
    if (req.url === '/api/plan' && req.method === 'PUT') {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        send(res, 400, { error: 'invalid json' });
        return;
      }
      await ensureDirs();
      await backupCurrentPlan();
      await writeFile(PLAN_PATH, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
      send(res, 200, { ok: true });
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

ensureDirs().then(() => {
  server.listen(PORT, () => {
    console.log(`[server] plan.json API on http://localhost:${PORT}`);
  });
});
