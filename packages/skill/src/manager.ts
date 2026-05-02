// CodeEngine Skill — Skill Manager
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Skill, SkillState, SkillMetadata } from './types.js';
import { loadSkills } from './loader.js';

const DEFAULT_SKILLS_DIR = '~/.codeengine/skills';
const STATE_FILE = '.codeengine/skills.json';

/**
 * Manages skills — load, list, enable, disable, get, remove.
 * State stored in .codeengine/skills.json.
 */
export class SkillManager {
  private statePath: string;
  private state: SkillState;

  constructor(baseDir: string = process.cwd()) {
    this.statePath = join(baseDir, STATE_FILE);
    this.state = this.loadState();
  }

  /**
   * Load skills from a templates directory and add/update in state.
   */
  async load(dir: string): Promise<Skill[]> {
    const skills = await loadSkills(dir);

    for (const skill of skills) {
      // Check if skill already exists by name
      const existingIdx = this.state.skills.findIndex(
        (s) => s.name === skill.name,
      );
      if (existingIdx >= 0) {
        // Update existing
        this.state.skills[existingIdx] = {
          id: this.state.skills[existingIdx].id,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
          enabled: this.state.skills[existingIdx].enabled,
        };
      } else {
        // Add new
        this.state.skills.push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
          enabled: skill.enabled,
        });
      }
    }

    this.state.updatedAt = Date.now();
    this.saveState();
    return skills;
  }

  /**
   * List all skills (enabled and disabled).
   */
  list(): SkillMetadata[] {
    return [...this.state.skills];
  }

  /**
   * Get a single skill by name.
   */
  get(name: string): SkillMetadata | undefined {
    return this.state.skills.find((s) => s.name === name);
  }

  /**
   * Get all skills as full Skill objects with content.
   */
  getAll(): Skill[] {
    return this.state.skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      content: '', // Content loaded from filesystem when needed
      enabled: s.enabled,
      category: s.category,
      tags: s.tags,
      createdAt: Date.now(),
    }));
  }

  /**
   * Enable a skill by name.
   */
  enable(name: string): boolean {
    const skill = this.state.skills.find((s) => s.name === name);
    if (!skill) return false;

    skill.enabled = true;
    this.state.updatedAt = Date.now();
    this.saveState();
    return true;
  }

  /**
   * Disable a skill by name.
   */
  disable(name: string): boolean {
    const skill = this.state.skills.find((s) => s.name === name);
    if (!skill) return false;

    skill.enabled = false;
    this.state.updatedAt = Date.now();
    this.saveState();
    return true;
  }

  /**
   * Remove a skill by name.
   */
  remove(name: string): boolean {
    const idx = this.state.skills.findIndex((s) => s.name === name);
    if (idx < 0) return false;

    this.state.skills.splice(idx, 1);
    this.state.updatedAt = Date.now();
    this.saveState();
    return true;
  }

  private loadState(): SkillState {
    try {
      if (existsSync(this.statePath)) {
        return JSON.parse(readFileSync(this.statePath, 'utf-8'));
      }
    } catch {
      // Ignore corrupted state
    }

    return {
      skills: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private saveState(): void {
    const stateDir = join(this.statePath, '..');
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }
}
