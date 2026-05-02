// @ts-nocheck
// SkillStore Unit Tests
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
  tmpDir = join(tmpdir(), 'codeengine-skill-' + (++counter));
  process.env.CODEENGINE_DATA_DIR = join(tmpDir, 'test.db');
  mod = await import('../index.js');
  return mod;
}

describe('SkillStore', async () => {
  it('should create and get a skill', async () => {
    const m = await importModule();
    const skill = m.skillStore.create({
      name: 'test-skill', category: 'testing', path: '/path/to/skill',
      content: '# Test Skill', context: 'Context',
      files: ['SKILL.md'], variables: ['VAR1'],
    });
    assert.strictEqual(skill.name, 'test-skill');
    assert.strictEqual(skill.category, 'testing');
    assert.deepStrictEqual(skill.files, ['SKILL.md']);
    const fetched = m.skillStore.get('test-skill');
    assert.ok(fetched);
    assert.strictEqual(fetched.content, '# Test Skill');
  });

  it('should update a skill', async () => {
    const m = await importModule();
    m.skillStore.create({
      name: 'test-skill', category: 'orig', path: '/path',
      content: '# Original', context: '',
      files: [], variables: [],
    });
    const updated = m.skillStore.update('test-skill', {
      category: 'updated', content: '# Updated',
    });
    assert.strictEqual(updated.category, 'updated');
    assert.strictEqual(updated.content, '# Updated');
  });

  it('should delete a skill', async () => {
    const m = await importModule();
    m.skillStore.create({
      name: 'test-skill', category: 'testing', path: '/path',
      content: '# Test', context: '',
      files: [], variables: [],
    });
    assert.ok(m.skillStore.delete('test-skill'));
    assert.strictEqual(m.skillStore.get('test-skill'), undefined);
  });
});
