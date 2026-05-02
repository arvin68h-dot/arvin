// @ts-nocheck
// TaskStore Unit Tests
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mod = null;
let counter = 0;
let tmpDir = '';

async function importModule() {
  if (mod) { mod.closeDb(); mod = null; }
  if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {} }
  tmpDir = join(tmpdir(), 'codeengine-task-' + (++counter));
  process.env.CODEENGINE_DATA_DIR = join(tmpDir, 'test.db');
  mod = await import('../index.js');
  return mod;
}

function createTestSession(m) {
  return m.sessionStore.create({
    title: 'Task Test', provider_id: 'm', model: 'm',
    tools: [], permission_entries: [], settings: {},
  });
}

describe('TaskStore', async () => {
  it('should create and list tasks', async () => {
    const m = await importModule();
    const session = createTestSession(m);
    const task = m.taskStore.create({
      name: 'Test Task', status: 'pending', description: 'A test',
      commands: [], files: [], dependencies: [],
    });
    assert.ok(task.id);
    assert.strictEqual(task.name, 'Test Task');
    assert.strictEqual(task.status, 'pending');
    assert.strictEqual(task.commands.length, 0);
    const tasks = m.taskStore.list();
    assert.strictEqual(tasks.length, 1);
  });

  it('should update and delete a task', async () => {
    const m = await importModule();
    const task = m.taskStore.create({
      name: 'To Update', status: 'pending', description: '',
      commands: ['echo hello'], files: ['test.txt'], dependencies: [],
    });
    const updated = m.taskStore.update(task.id, { status: 'completed', name: 'Updated' });
    assert.ok(updated);
    assert.strictEqual(updated.status, 'completed');
    assert.strictEqual(updated.name, 'Updated');
    assert.ok(m.taskStore.delete(task.id));
    assert.strictEqual(m.taskStore.get(task.id), undefined);
  });
});
