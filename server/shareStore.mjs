import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function forbidden(message) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(temp, file);
}

function equalHash(a, b) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createShareStore({ dataDir }) {
  await mkdir(dataDir, { recursive: true });
  const indexPath = path.join(dataDir, 'share-links.json');
  const commentsPath = (ownerId) => path.join(dataDir, `share-comments-${ownerId}.json`);

  async function readIndex() {
    const value = await readJson(indexPath, { links: [] });
    return Array.isArray(value.links) ? value : { links: [] };
  }

  return {
    async createShareLink(ownerId) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(token);
      const index = await readIndex();
      index.links = index.links.filter((link) => link.ownerId !== ownerId);
      index.links.push({ ownerId, tokenHash, createdAt: new Date().toISOString() });
      await writeJsonAtomic(indexPath, index);
      return { token, createdAt: index.links.at(-1).createdAt };
    },

    async resolveShare(token) {
      if (typeof token !== 'string' || token.length < 32) return null;
      const candidate = hashToken(token);
      const index = await readIndex();
      const link = index.links.find((item) => typeof item.tokenHash === 'string' && equalHash(item.tokenHash, candidate));
      return link ? { ownerId: link.ownerId, createdAt: link.createdAt } : null;
    },

    async revokeShare(ownerId) {
      const index = await readIndex();
      const previous = index.links.length;
      index.links = index.links.filter((link) => link.ownerId !== ownerId);
      await writeJsonAtomic(indexPath, index);
      return previous !== index.links.length;
    },

    async linkStatus(ownerId) {
      const index = await readIndex();
      const link = index.links.find((item) => item.ownerId === ownerId);
      return link ? { createdAt: link.createdAt } : null;
    },

    async listComments(ownerId, { epicId, segmentId }) {
      const comments = await readJson(commentsPath(ownerId), []);
      return comments.filter((comment) => comment.epicId === epicId && comment.segmentId === segmentId);
    },

    async createComment(ownerId, input) {
      const type = ['question', 'comment', 'issue'].includes(input?.type) ? input.type : null;
      const text = typeof input?.text === 'string' ? input.text.trim() : '';
      if (!type || !text || text.length > 2000) throw invalid('Некорректный комментарий.');
      const comments = await readJson(commentsPath(ownerId), []);
      const comment = {
        id: randomBytes(12).toString('hex'),
        epicId: String(input.epicId || ''),
        segmentId: String(input.segmentId || ''),
        type,
        text,
        authorId: input.authorId,
        authorName: input.authorName,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
      };
      if (!comment.epicId || !comment.segmentId) throw invalid('Не задана колбаска для комментария.');
      comments.push(comment);
      await writeJsonAtomic(commentsPath(ownerId), comments);
      return comment;
    },

    async setCommentResolved(ownerId, commentId, actor, resolved) {
      const comments = await readJson(commentsPath(ownerId), []);
      const index = comments.findIndex((comment) => comment.id === commentId);
      if (index < 0) throw Object.assign(new Error('Комментарий не найден.'), { statusCode: 404 });
      const comment = comments[index];
      if (actor.id !== ownerId && actor.id !== comment.authorId) throw forbidden('Нельзя изменить этот комментарий.');
      comments[index] = { ...comment, resolvedAt: resolved ? new Date().toISOString() : null, resolvedBy: resolved ? actor.id : null };
      await writeJsonAtomic(commentsPath(ownerId), comments);
      return comments[index];
    },

    async deleteComment(ownerId, commentId, actor) {
      const comments = await readJson(commentsPath(ownerId), []);
      const comment = comments.find((item) => item.id === commentId);
      if (!comment) throw Object.assign(new Error('Комментарий не найден.'), { statusCode: 404 });
      if (actor.id !== ownerId && actor.id !== comment.authorId) throw forbidden('Нельзя удалить этот комментарий.');
      await writeJsonAtomic(commentsPath(ownerId), comments.filter((item) => item.id !== commentId));
    },
  };
}

