// CodeEngine Skill — Types

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  category?: string;
  tags: string[];
  createdAt: number;
}

export interface SkillMatch {
  skill: Skill;
  score: number;
  reason: string;
}

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  category?: string;
  tags: string[];
  enabled: boolean;
}

export interface SkillState {
  skills: SkillMetadata[];
  createdAt: number;
  updatedAt: number;
}
