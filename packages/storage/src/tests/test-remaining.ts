// @ts-nocheck
// CheckpointStore, ConversationStore & sanitizeForExport Unit Tests
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mod = null;
let counter = 0;
let tmpDir = '';

async function importModule() {
  if (mod) { mod.closeDb(); mod = null; }
  if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {} }
  tmpDir = join(tmpdir(), 'codeengine-remain-' + (++counter));
  process.env.CODEENGINE_DATA_DIR = join(tmpDir, 'test.db');
  mod = await import('../index.js');
  return mod;
}

describe('CheckpointStore & ConversationStore & sanitize', async () => {
  it('should create and get checkpoints', async () => {
    const m = await importModule();
    const session = m.sessionStore.create({
      title: 'Check Test', provider_id: 'm', model: 'm',
      tools: [], permission_entries: [], settings: {},
    });
    const cp = m.checkpointStore.create({
      sessionId: session.id,
      messageIds: ['msg1', 'msg2'],
      cwd: '/project',
      filesSnapshot: [
        { path: 'src/main.ts', content: 'console.log("test");', timestamp: Date.now() },
      ],
      gitStatus: 'modified: src/main.ts',
    });
    assert.ok(cp.id);
    const fetched = m.checkpointStore.getBySession(session.id);
    assert.strictEqual(fetched.length, 1);
    assert.strictEqual(fetched[0].cwd, '/project');
    assert.strictEqual(fetched[0].messageIds.length, 2);
  });

  it('should create and get conversations', async () => {
    const m = await importModule();
    const session = m.sessionStore.create({
      title: 'Conv Session', provider_id: 'm', model: 'm',
      tools: [], permission_entries: [], settings: {},
    });
    const conv = m.conversationStore.create({ title: 'New Conv', sessionId: session.id });
    assert.ok(conv.id);
    assert.strictEqual(conv.title, 'New Conv');
    const fetched = m.conversationStore.get(conv.id);
    assert.ok(fetched);
    assert.strictEqual(fetched.title, 'New Conv');
  });

  it('should update a conversation', async () => {
    const m = await importModule();
    const conv = m.conversationStore.create({ title: 'Old' });
    const updated = m.conversationStore.update(conv.id, { title: 'New' });
    assert.strictEqual(updated.title, 'New');
  });

  it('should list conversations', async () => {
    const m = await importModule();
    m.conversationStore.create({ title: 'C1' });
    m.conversationStore.create({ title: 'C2' });
    const convs = m.conversationStore.list();
    assert.strictEqual(convs.length, 2);
  });

  it('should delete a conversation', async () => {
    const m = await importModule();
    const conv = m.conversationStore.create({ title: 'Del' });
    assert.ok(m.conversationStore.delete(conv.id));
    assert.strictEqual(m.conversationStore.get(conv.id), undefined);
  });

  it('should sanitize export data', async () => {
    const m = await importModule();
    const session = m.sessionStore.create({
      title: 'Export', provider_id: 'openai', model: 'gpt-4',
      tools: [], permission_entries: [{ user: 'u1', level: 'admin' }], settings: { key: 'secret' },
    });
    m.messageStore.create({ role: 'user', content: 'hello', timestamp: Date.now() }, session.id);
    const data = m.sanitizeForExport([{ role: 'user', content: 'api_key = "sk-1234567890abcdef"' }]);
    assert.ok(data.includes('api_key: [REDACTED]'));
    assert.ok(data.includes('[user]'));
  });
});
