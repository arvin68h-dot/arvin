// @ts-nocheck
// MessageStore Unit Tests
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
  tmpDir = join(tmpdir(), 'codeengine-msg-' + (++counter));
  process.env.CODEENGINE_DATA_DIR = join(tmpDir, 'test.db');
  mod = await import('../index.js');
  return mod;
}

function createTestSession(m) {
  return m.sessionStore.create({
    title: 'Msg Test', provider_id: 'm', model: 'm',
    tools: [], permission_entries: [], settings: {},
  });
}

describe('MessageStore', async () => {
  it('should create a message', async () => {
    const m = await importModule();
    const session = createTestSession(m);
    const msg = m.messageStore.create({
      role: 'user', content: 'Hello, World!', timestamp: Date.now(),
    }, session.id);
    assert.ok(msg.id);
    assert.strictEqual(msg.role, 'user');
    assert.strictEqual(msg.content, 'Hello, World!');
  });

  it('should create a message with tool calls', async () => {
    const m = await importModule();
    const session = createTestSession(m);
    const msg = m.messageStore.create({
      role: 'assistant', content: 'Calling...',
      timestamp: Date.now(),
      toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'test', arguments: '{}' } }],
    }, session.id);
    assert.ok(msg.toolCalls);
    assert.strictEqual(msg.toolCalls.length, 1);
    assert.strictEqual(msg.toolCalls[0].function.name, 'test');
  });

  it('should batch insert messages', async () => {
    const m = await importModule();
    const session = createTestSession(m);
    const msgs = [
      { role: 'user', content: 'Msg 1', timestamp: Date.now() },
      { role: 'assistant', content: 'Msg 2', timestamp: Date.now() + 1 },
      { role: 'user', content: 'Msg 3', timestamp: Date.now() + 2 },
    ];
    const count = m.messageStore.batchInsert(msgs, session.id);
    assert.strictEqual(count, 3);
  });

  it('should delete all messages by session', async () => {
    const m = await importModule();
    const session = createTestSession(m);
    m.messageStore.create({ role: 'user', content: 'm1', timestamp: Date.now() }, session.id);
    m.messageStore.create({ role: 'assistant', content: 'm2', timestamp: Date.now() + 1 }, session.id);
    const count = m.messageStore.deleteBySession(session.id);
    assert.strictEqual(count, 2);
  });
});
