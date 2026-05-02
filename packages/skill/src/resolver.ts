// CodeEngine Skill — Skill Resolver
import type { Skill, SkillMatch } from './types.js';

/**
 * Match skills to a task description using keyword scoring.
 * Returns top 3 matching skills with score and reason.
 */
export function matchSkill(
  taskDescription: string,
  skills: Skill[],
): SkillMatch[] {
  if (skills.length === 0) return [];

  const taskWords = tokenize(taskDescription.toLowerCase());
  const scored: { skill: Skill; score: number; reason: string }[] = [];

  for (const skill of skills) {
    if (!skill.enabled) continue;

    let score = 0;
    const reasons: string[] = [];

    // Score from description match
    const descWords = tokenize(skill.description.toLowerCase());
    for (const word of taskWords) {
      if (descWords.includes(word)) {
        score += 3;
      }
    }

    // Score from tags match
    if (skill.tags) {
      for (const tag of skill.tags) {
        const tagWords = tokenize(tag.toLowerCase());
        for (const word of taskWords) {
          if (tagWords.includes(word)) {
            score += 5;
          }
        }
      }
    }

    // Score from category match
    if (skill.category) {
      const catWords = tokenize(skill.category.toLowerCase());
      for (const word of taskWords) {
        if (catWords.includes(word)) {
          score += 4;
        }
      }
    }

    // Score from name match
    const nameWords = tokenize(skill.name.toLowerCase());
    for (const word of taskWords) {
      if (nameWords.includes(word)) {
        score += 6;
      }
    }

    if (score > 0) {
      reasons.push(`Found ${descWords.filter(w => taskWords.includes(w)).length} matching words in description`);
      if (skill.tags && skill.tags.some(t => tokenize(t.toLowerCase()).some(tw => taskWords.includes(tw)))) {
        reasons.push('Tag match');
      }
      if (skill.category && tokenize(skill.category.toLowerCase()).some(cw => taskWords.includes(cw))) {
        reasons.push('Category match');
      }
      if (nameWords.some(nw => taskWords.includes(nw))) {
        reasons.push('Name match');
      }

      scored.push({
        skill,
        score,
        reason: reasons.join('; '),
      });
    }
  }

  // Sort by score descending, take top 3
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function tokenize(text: string): string[] {
  return text
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}
