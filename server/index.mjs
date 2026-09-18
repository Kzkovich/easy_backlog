import http from 'node:http';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir, unlink, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.KOLBASKI_DATA_DIR || path.join(ROOT, 'data');
const TEMPLATE_PATH = path.join(DATA_DIR, 'plan.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const USER_DATA_DIR = path.join(DATA_DIR, 'users');
const MAX_BACKUPS = 50;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PORT = Number(process.env.PORT || 5175);

const sessions = new Map();
const attempts = new Map();
let authMutation = Promise.resolve();

async function ensureDirs() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(USER_DATA_DIR, { recursive: true });
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds())}`;
}

function userPaths(userId) {
  const root = path.join(USER_DATA_DIR, userId);
  return { plan: path.join(root, 'plan.json'), backups: path.join(root, 'backups') };
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await rename(tempPath, filePath);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function readUsers() {
  const users = await readJson(USERS_PATH, []);
  return Array.isArray(users) ? users : [];
}

function normalizedUsername(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('ru-RU');
}

function publicUser(user) {
  return { id: user.id, username: user.username };
}

async function passwordHash(password, salt) {
  return Buffer.from(await scrypt(password, salt, 64)).toString('hex');
}

async function verifyPassword(password, user) {
  const actual = Buffer.from(await passwordHash(password, user.salt), 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([key]) => key)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))])
  );
}

function sessionUser(req) {
  const token = parseCookies(req).kolbaski_session;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return session.user;
}

function sessionCookie(req, token, maxAge) {
  const forwardedHttps = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const secure = forwardedHttps || process.env.KOLBASKI_SECURE_COOKIE === '1';
  return `kolbaski_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function startSession(req, res, user) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { user: publicUser(user), expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', sessionCookie(req, token, Math.floor(SESSION_TTL_MS / 1000)));
}

function endSession(req, res) {
  const token = parseCookies(req).kolbaski_session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readJsonBody(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch (err) {
    if (err.statusCode) throw err;
    throw Object.assign(new Error('invalid json'), { statusCode: 400 });
  }
}

function checkRateLimit(req, action) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const key = `${action}:${ip}`;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length <= 12;
}

function currentSprintIndex(sprints) {
  const today = new Date().toISOString().slice(0, 10);
  const active = sprints.find((sprint) => sprint.dateFrom <= today && sprint.dateTo >= today);
  if (active) return active.index;
  const future = sprints.find((sprint) => sprint.dateFrom > today);
  return future?.index ?? Math.max(0, sprints.length - 6);
}

function createDemoPlan(template) {
  const roles = Array.isArray(template.roles) ? template.roles : [];
  const tracked = roles.filter((role) => role.capacityTracked).slice(0, 4);
  const roleIds = (tracked.length ? tracked : roles.slice(0, 4)).map((role) => role.id);
  const sprints = template.sprints || [];
  const start = Math.min(currentSprintIndex(sprints), Math.max(0, sprints.length - 7));
  const role = (index) => roleIds[index % Math.max(1, roleIds.length)] || 'dev';
  const segment = (id, roleId, from, to, label) => ({ id, role: roleId, from, to, label, color: null, flag: null });
  const planned = (id, roleId, from, to, label) => ({ id, role: roleId, from, to, label });
  const epic = (id, title, offset, labels) => ({
    id,
    title,
    teams: ['demo-team'],
    enabled: true,
    status: offset ? 'бэклог' : 'разработка',
    effectYear: null,
    effect2026: null,
    effectKind: null,
    needsKb: false,
    notes: 'Демонстрационная фича — откройте её и попробуйте изменить параметры.',
    links: [],
    visibleRoles: roleIds.slice(0, 3),
    segments: [
      segment(`${id}-discovery`, role(0), start + offset, start + offset + 1, labels[0]),
      segment(`${id}-build`, role(1), start + offset + 1, start + offset + 3, labels[1]),
      segment(`${id}-qa`, role(2), start + offset + 3, start + offset + 4, labels[2]),
    ],
    plannedSegments: [
      planned(`${id}-planned-discovery`, role(0), start + offset, start + offset + 2, `План · ${labels[0]}`),
      planned(`${id}-planned-build`, role(1), start + offset + 2, start + offset + 4, `План · ${labels[1]}`),
    ],
  });

  return {
    ...template,
    teams: [{ id: 'demo-team', name: 'Продуктовая команда', shortName: 'PRODUCT', sprintBase: 1 }],
    people: roleIds.map((roleId, index) => ({
      id: `demo-person-${index + 1}`,
      name: ['Анна', 'Михаил', 'Ольга', 'Илья'][index] || `Участник ${index + 1}`,
      role: roleId,
      allocations: [{ team: 'demo-team', share: 1 }],
      absences: [],
    })),
    epics: [
      epic('demo-client-cabinet', 'Мобильный кабинет клиента', 0, ['Исследование', 'Разработка', 'Проверка']),
      epic('demo-smart-search', 'Умный поиск по каталогу', 2, ['Прототип', 'Интеграция', 'Запуск']),
    ],
    scenarios: [],
  };
}

async function createUserPlan(userId, useCurrentPlan = false) {
  const paths = userPaths(userId);
  await mkdir(paths.backups, { recursive: true });
  const template = await readJson(TEMPLATE_PATH, null);
  if (!template) throw new Error('demo plan template is missing');
  await writeJsonAtomic(paths.plan, useCurrentPlan ? template : createDemoPlan(template));
}

async function ensureOwnerAccount() {
  const username = String(process.env.KOLBASKI_OWNER_USERNAME || '').normalize('NFKC').trim();
  const password = process.env.KOLBASKI_OWNER_PASSWORD || '';
  if (!username && !password) return;
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username) || password.length < 8 || password.length > 128) {
    throw new Error('KOLBASKI_OWNER_USERNAME / KOLBASKI_OWNER_PASSWORD are invalid');
  }
  const users = await readUsers();
  const usernameKey = normalizedUsername(username);
  if (users.some((user) => user.usernameKey === usernameKey)) return;
  const user = { id: randomBytes(12).toString('hex'), username, usernameKey, salt: randomBytes(16).toString('hex'), createdAt: new Date().toISOString() };
  user.passwordHash = await passwordHash(password, user.salt);
  const paths = userPaths(user.id);
  await mkdir(paths.backups, { recursive: true });
  const currentPlan = await readJson(TEMPLATE_PATH, null);
  if (!currentPlan) throw new Error('owner plan template is missing');
  await writeJsonAtomic(paths.plan, currentPlan);
  await writeJsonAtomic(USERS_PATH, [...users, user]);
  console.log(`[server] Owner account "${username}" created from data/plan.json`);
}

async function pruneBackups(backupsDir) {
  const files = (await readdir(backupsDir)).filter((file) => file.endsWith('.json'));
  if (files.length <= MAX_BACKUPS) return;
  const withStats = await Promise.all(files.map(async (file) => ({ file, mtime: (await stat(path.join(backupsDir, file))).mtimeMs })));
  withStats.sort((a, b) => a.mtime - b.mtime);
  await Promise.all(withStats.slice(0, files.length - MAX_BACKUPS).map(({ file }) => unlink(path.join(backupsDir, file))));
}

async function backupCurrentPlan(userId) {
  const paths = userPaths(userId);
  try {
    const current = await readFile(paths.plan, 'utf-8');
    await writeFile(path.join(paths.backups, `plan-${timestamp()}.json`), current, 'utf-8');
    await pruneBackups(paths.backups);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function withAuthMutation(fn) {
  const previous = authMutation;
  let release;
  authMutation = new Promise((resolve) => (release = resolve));
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (req.method === 'OPTIONS') return send(res, 204, undefined, { Allow: 'GET,POST,PUT,OPTIONS' });

    if (pathname === '/api/auth/session' && req.method === 'GET') return send(res, 200, { user: sessionUser(req) });

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      if (!checkRateLimit(req, 'register')) return send(res, 429, { error: 'Слишком много попыток. Попробуйте позже.' });
      const { username: rawUsername, password } = await readJsonBody(req);
      const username = String(rawUsername || '').normalize('NFKC').trim();
      const usernameKey = normalizedUsername(username);
      if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) return send(res, 400, { error: 'Логин: 3–32 буквы, цифры, точка, дефис или подчёркивание.' });
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) return send(res, 400, { error: 'Пароль должен содержать от 8 до 128 символов.' });

      const result = await withAuthMutation(async () => {
        const users = await readUsers();
        if (users.some((item) => item.usernameKey === usernameKey)) return { conflict: true };
        const user = { id: randomBytes(12).toString('hex'), username, usernameKey, salt: randomBytes(16).toString('hex'), createdAt: new Date().toISOString() };
        user.passwordHash = await passwordHash(password, user.salt);
        // Первый аккаунт создаётся, пока сайт ещё закрыт внешним Basic Auth,
        // и наследует существующий рабочий план. Все следующие получают демо.
        await createUserPlan(user.id, users.length === 0);
        await writeJsonAtomic(USERS_PATH, [...users, user]);
        return { user };
      });
      if (result.conflict) return send(res, 409, { error: 'Такой логин уже занят.' });
      startSession(req, res, result.user);
      return send(res, 201, { user: publicUser(result.user) });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (!checkRateLimit(req, 'login')) return send(res, 429, { error: 'Слишком много попыток. Попробуйте позже.' });
      const { username, password } = await readJsonBody(req);
      const user = (await readUsers()).find((item) => item.usernameKey === normalizedUsername(username));
      if (!user || typeof password !== 'string' || !(await verifyPassword(password, user))) return send(res, 401, { error: 'Неверный логин или пароль.' });
      startSession(req, res, user);
      return send(res, 200, { user: publicUser(user) });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      endSession(req, res);
      return send(res, 200, { ok: true });
    }

    const user = sessionUser(req);
    if (!user) return send(res, 401, { error: 'Нужно войти в аккаунт.' });
    const paths = userPaths(user.id);

    if (pathname === '/api/plan' && req.method === 'GET') {
      const raw = await readFile(paths.plan, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(raw);
    }

    if (pathname === '/api/plan' && req.method === 'PUT') {
      const plan = await readJsonBody(req);
      if (!plan || !Array.isArray(plan.sprints) || !Array.isArray(plan.epics)) return send(res, 400, { error: 'Некорректный формат плана.' });
      await mkdir(paths.backups, { recursive: true });
      await backupCurrentPlan(user.id);
      await writeJsonAtomic(paths.plan, plan);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    return send(res, err.statusCode || 500, { error: err.statusCode ? err.message : 'Внутренняя ошибка сервера.' });
  }
});

ensureDirs().then(async () => {
  await ensureOwnerAccount();
  server.listen(PORT, () => console.log(`[server] Kolbaski API on http://localhost:${PORT}`));
});
