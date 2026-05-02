// CodeEngine Skill — Load skills from filesystem
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Skill } from './types.js';

const SKILL_FILE_EXTENSIONS = new Set(['.md']);

/**
 * Load skills from a directory containing .md files.
 * Parses YAML frontmatter for name, description, category, tags.
 * Body of the file is the skill content.
 */
export async function loadSkills(dir: string): Promise<Skill[]> {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return [];
  }

  const skills: Skill[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    if (!SKILL_FILE_EXTENSIONS.has(extname(entry).toLowerCase())) continue;

    const fullPath = join(dir, entry);
    const content = readFileSync(fullPath, 'utf-8');

    const parsed = parseFrontmatter(content);

    const skill: Skill = {
      id: randomUUID(),
      name: parsed.name || basename(entry, extname(entry)),
      description: parsed.description || '',
      content: parsed.body,
      enabled: true,
      category: parsed.category,
      tags: parsed.tags || [],
      createdAt: Date.now(),
    };

    skills.push(skill);
  }

  return skills;
}

interface ParsedFrontmatter {
  name: string;
  description: string;
  category: string | undefined;
  tags: string[];
  body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  let body = content;
  let name = '';
  let description = '';
  let category: string | undefined;
  const tags: string[] = [];

  // Check for YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (frontmatterMatch) {
    const fmContent = frontmatterMatch[1];
    body = frontmatterMatch[2] || '';

    // Parse name
    const nameMatch = fmContent.match(/name:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();

    // Parse description
    const descMatch = fmContent.match(/description:\s*(.+)$/m);
    if (descMatch) description = descMatch[1].trim();

    // Parse category
    const catMatch = fmContent.match(/category:\s*(.+)$/m);
    if (catMatch) category = catMatch[1].trim();

    // Parse tags
    const tagsMatch = fmContent.match(/tags:\s*\[([^\]]*)\]/m);
    if (tagsMatch) {
      tags.push(
        ...tagsMatch[1].split(',').map((t) => t.trim()).filter((t) => t.length > 0),
      );
    }
  } else {
    body = content;
  }

  return { name, description, category, tags, body };
}
