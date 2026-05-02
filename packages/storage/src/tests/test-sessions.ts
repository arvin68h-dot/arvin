// @ts-nocheck
// SessionStore Unit Tests
import { describe, it } from 'node:test';
import assert from 'node:assert';

let mod = null;

async function importModule() {
  // Close previous DB to get a clean state
  if (mod) {
    try { mod.closeDb(); } catch(e) {}
  }
  // Use exactly ':memory:' — SQLite creates a fresh anonymous in-memory DB per connection
  process.env.CODEENGINE_DATA_DIR = ':memory:';
  // Re-import to reset module state (tsx re-executes for each import call)
  mod = await import('../index.js');
  const count = mod.sessionStore.list().length;
  return mod;
}

describe('SessionStore', async () => {
  it('should create a session', async () => {
    const m = await importModule();
    const session = m.sessionStore.create({
      title: 'Test Session', provider_id: 'openai', model: 'gpt-4',
      tools: [], permission_entries: [], settings: {},
    });
    assert.ok(session.id);
    assert.strictEqual(session.title, 'Test Session');
  });

  it('should list all sessions', async () => {
    const m = await importModule();
    m.sessionStore.create({ title: 'S1', provider_id: 'a', model: 'a', tools: [], permission_entries: [], settings: {} });
    m.sessionStore.create({ title: 'S2', provider_id: 'b', model: 'b', tools: [], permission_entries: [], settings: {} });
    const sessions = m.sessionStore.list();
    assert.strictEqual(sessions.length, 2);
  });
});
