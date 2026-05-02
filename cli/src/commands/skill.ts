#!/usr/bin/env node
/**
 * Skill 命令 — 管理 CodeEngine 技能
 *
 * 用法:
 *   codeengine skill list [--enabled | --disabled | --all]
 *   codeengine skill show <name>
 *   codeengine skill enable <name>
 *   codeengine skill disable <name>
 *   codeengine skill remove <name>
 *   codeengine skill --help
 */

import { SkillManager } from '@codeengine/skill';
import { matchSkill } from '@codeengine/skill';

// ─── 颜色常量 ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// 全局技能管理器实例
let _skillManager: SkillManager | null = null;

/**
 * 获取或创建技能管理器单例
 * @returns 技能管理器实例
 */
function getSkillManager(): SkillManager {
  if (!_skillManager) {
    _skillManager = new SkillManager(process.cwd());
  }
  return _skillManager;
}

/**
 * 获取技能状态标签 — 返回带颜色的状态字符串
 * @param enabled — 技能是否启用
 * @returns 带颜色的状态标签
 */
function statusLabel(enabled: boolean): string {
  return enabled ? `${GREEN}已启用${RESET}` : `${YELLOW}已禁用${RESET}`;
}

/**
 * 格式化标签数组为可读字符串
 * @param tags — 标签数组
 * @returns 逗号分隔的标签字符串
 */
function formatTags(tags: string[]): string {
  if (tags.length === 0) return '(无)';
  return tags.join(', ');
}

/**
 * 运行技能列表命令 — 展示所有已加载的技能
 * @param args — 命令行参数数组，支持: --enabled, --disabled, --all
 */
export async function runList(args: string[]): Promise<void> {
  const sm = getSkillManager();
  const skills = sm.list();

  // 解析过滤选项
  const filter = args.find(a => a.startsWith('--')) || 'all';

  let filtered = skills;
  if (filter === '--enabled') {
    filtered = skills.filter(s => s.enabled);
  } else if (filter === '--disabled') {
    filtered = skills.filter(s => !s.enabled);
  }
  // --all 不过滤

  if (filtered.length === 0) {
    const total = skills.length;
    if (total > 0) {
      console.log(`  ${YELLOW}无匹配的技能${RESET}`);
    } else {
      console.log(`  ${YELLOW}无技能已加载${RESET}`);
      console.log(`  使用 ${CYAN}codeengine skill load <dir>${RESET} 加载技能目录`);
    }
    return;
  }

  console.log(`\n${BOLD}技能 (${filtered.length}/${skills.length})${RESET}  [过滤: ${filter}]\n`);

  // 按类别分组
  const byCategory = new Map<string, typeof skills>();
  for (const skill of filtered) {
    const cat = skill.category || '其他';
    const existing = byCategory.get(cat) || [];
    existing.push(skill);
    byCategory.set(cat, existing);
  }

  for (const [category, catSkills] of byCategory) {
    console.log(`  ${CYAN}${category}${RESET}`);
    for (const skill of catSkills) {
      const enabled = statusLabel(skill.enabled);
      console.log(`    ${GREEN}${skill.name}${RESET}  [${enabled}]  ${skill.description.slice(0, 50)}${skill.description.length > 50 ? '...' : ''}`);
    }
    console.log('');
  }

  console.log(`使用 ${CYAN}codeengine skill show <name>${RESET} 查看技能详情`);
}

/**
 * 运行技能详情命令 — 显示指定技能的完整信息
 * @param args — 命令行参数数组，预期格式: [<skillName>]
 */
export async function runShow(args: string[]): Promise<void> {
  const sm = getSkillManager();
  const name = args[0];

  if (!name) {
    console.error(`  ${RED}请提供技能名称${RESET}`);
    console.error(`  用法: codeengine skill show <skill-name>`);
    console.error(`  使用 ${CYAN}codeengine skill list${RESET} 查看所有技能`);
    process.exit(1);
  }

  const skill = sm.get(name);
  if (!skill) {
    console.error(`  ${RED}技能未找到: ${name}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}技能详情: ${skill.name}${RESET}`);
  console.log(`  ID:       ${skill.id}`);
  console.log(`  类别:     ${skill.category || '(无)'}`);
  console.log(`  状态:     ${statusLabel(skill.enabled)}`);
  console.log(`  描述:     ${skill.description || '(无)'}`);
  console.log(`  标签:     ${formatTags(skill.tags)}`);
}

/**
 * 运行启用技能命令 — 激活指定技能
 * @param args — 命令行参数数组，预期格式: [<skillName>]
 */
export async function runEnable(args: string[]): Promise<void> {
  const sm = getSkillManager();
  const name = args[0];

  if (!name) {
    console.error(`  ${RED}请提供技能名称${RESET}`);
    console.error(`  用法: codeengine skill enable <skill-name>`);
    process.exit(1);
  }

  const ok = sm.enable(name);
  if (ok) {
    console.log(`\n${GREEN}[OK]${RESET} 技能已启用: ${name}`);
  } else {
    console.error(`\n${RED}[ERROR]${RESET} 技能未找到: ${name}`);
    process.exit(1);
  }
}

/**
 * 运行禁用技能命令 — 停用指定技能
 * @param args — 命令行参数数组，预期格式: [<skillName>]
 */
export async function runDisable(args: string[]): Promise<void> {
  const sm = getSkillManager();
  const name = args[0];

  if (!name) {
    console.error(`  ${RED}请提供技能名称${RESET}`);
    console.error(`  用法: codeengine skill disable <skill-name>`);
    process.exit(1);
  }

  const ok = sm.disable(name);
  if (ok) {
    console.log(`\n${GREEN}[OK]${RESET} 技能已禁用: ${name}`);
  } else {
    console.error(`\n${RED}[ERROR]${RESET} 技能未找到: ${name}`);
    process.exit(1);
  }
}

/**
 * 运行删除技能命令 — 移除指定技能
 * @param args — 命令行参数数组，预期格式: [<skillName>]
 */
export async function runRemove(args: string[]): Promise<void> {
  const sm = getSkillManager();
  const name = args[0];

  if (!name) {
    console.error(`  ${RED}请提供技能名称${RESET}`);
    console.error(`  用法: codeengine skill remove <skill-name>`);
    process.exit(1);
  }

  const ok = sm.remove(name);
  if (ok) {
    console.log(`\n${GREEN}[OK]${RESET} 技能已删除: ${name}`);
  } else {
    console.error(`\n${RED}[ERROR]${RESET} 技能未找到: ${name}`);
    process.exit(1);
  }
}

/**
 * 运行技能命令入口 — 根据子命令路由到对应处理器
 * @param args — 完整的命令行参数数组（已去掉 'skill' 本身）
 */
export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (command === 'list' || !command) {
    await runList(args.slice(1));
  } else if (command === 'show') {
    await runShow(args.slice(1));
  } else if (command === 'enable') {
    await runEnable(args.slice(1));
  } else if (command === 'disable') {
    await runDisable(args.slice(1));
  } else if (command === 'remove') {
    await runRemove(args.slice(1));
  } else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`\n${BOLD}技能管理${RESET}\n`);
    console.log(`  用法: codeengine skill [命令] [参数]\n`);
    console.log(`  命令:`);
    console.log(`    list [--enabled|--disabled|--all]  列出所有技能（支持过滤）`);
    console.log(`    show <name>                        显示技能详细信息`);
    console.log(`    enable <name>                      启用指定技能`);
    console.log(`    disable <name>                     禁用指定技能`);
    console.log(`    remove <name>                      删除指定技能`);
    console.log(`    --help                             显示此帮助信息\n`);
  } else {
    console.error(`  未知子命令: ${command}`);
    console.error(`  使用 codeengine skill --help 查看用法`);
    process.exit(1);
  }
}
