import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createShareStore } from './shareStore.mjs';

async function store() {
  return createShareStore({ dataDir: await mkdtemp(path.join(os.tmpdir(), 'kolbaski-share-')) });
}

test('replacing a share link invalidates its previous token', async () => {
  const shares = await store();
  const first = await shares.createShareLink('owner');
  const second = await shares.createShareLink('owner');

  assert.equal(await shares.resolveShare(first.token), null);
  assert.equal((await shares.resolveShare(second.token)).ownerId, 'owner');
});

test('another participant cannot delete a comment', async () => {
  const shares = await store();
  const comment = await shares.createComment('owner', { authorId: 'a', authorName: 'Анна', epicId: 'e', segmentId: 's', type: 'question', text: 'Когда?' });

  await assert.rejects(() => shares.deleteComment('owner', comment.id, { id: 'b' }), { statusCode: 403 });
});
