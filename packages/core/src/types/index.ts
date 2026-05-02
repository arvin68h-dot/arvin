// ========================
// CodeEngine — 核心类型定义
// ========================

// ─── 基础常量 ───
export const CODEENGINE_VERSION = '0.1.0';
export const DEFAULT_SESSION_TIMEOUT = 3600000;
export const MAX_MESSAGES_PER_SESSION = 10000;
export const COMPACTION_TRIGGER_TOKENS = 128000;
export const COMPACTION_MIN_TOKENS = 16000;
export const LOG_DIR = '~/.codeengine/logs';
export const CONFIG_DIR = '~/.codeengine';
export const STORAGE_PATH = '~/.codeengine/data/codeengine.db';
export const CHECKPOINT_DIR = '.codeengine';
export const SKILL_DIR = '~/.codeengine/skills';

// ─── 通用工具结果 ───
export interface ToolResult {
  success: boolean;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ToolError extends Record<string, unknown> {
  tool: string;
  message: string;
  code?: string;
  stack?: string;
}

// ─── 消息系统 ───
export enum UserRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
  SYSTEM = 'system',
  THINKING = 'thinking',
  DEV = 'dev',
}

export interface AgentMessage {
  id: string;
  role: UserRole;
  content: string | ContentBlock[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'file' | 'tool_use' | 'tool_result' | 'tool_error' | 'think';
  content: string | Record<string, unknown>;
  id?: string;
}

export interface ToolUseBlock extends ContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  thought?: string;
}

export interface ToolResultBlock extends ContentBlock {
  type: 'tool_result';
  id: string;
  content: string | ToolError;
  is_error?: boolean;
}

export interface ToolErrorBlock extends ContentBlock {
  type: 'tool_error';
  id: string;
  error: ToolError;
}

export interface ThinkBlock extends ContentBlock {
  type: 'think';
  content: string;
  max_thinking_tokens?: number;
}

// ─── 工具定义 ───
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;
  require_approval: boolean;
  is_blocking: boolean;
  category: ToolCategory;
  version: string;
}

export enum ToolCategory {
  FILE = 'file',
  CODE = 'code',
  SHELL = 'shell',
  ANALYSIS = 'analysis',
  VERSION_CONTROL = 'version',
  BUILD = 'build',
  ENGINE = 'engine',
  SYSTEM = 'system',
  LSP = 'lsp',
  MULTI_TURN = 'multi_turn',
}

export interface ToolHandler {
  (input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  definition: ToolDefinition;
}

export interface ToolContext {
  sessionId: string;
  workingDir: string;
  provider: string;
  permissionLevel: PermissionLevel;
  projectRoot?: string;
  engineRegistry?: EngineRegistry;
  logger?: Logger | null;
}

// ─── JSON Schema 定义 ───
export interface JSONSchema7 {
  $schema?: string;
  type: string | string[];
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  additionalProperties?: boolean | Record<string, unknown>;
  items?: JSONSchema7;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

// ─── Provider（LLM 模型） ───
export enum ProviderType {
  OPENAI_COMPATIBLE = 'openai_compatible',
  ANTHROPIC = 'anthropic',
  OLLAMA = 'ollama',
  LOCAL = 'local',
  BEDROCK = 'bedrock',
  VERTEX = 'vertex',
}

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  model: string;
  baseURL?: string;
  apiKey?: string;
  apiVersion?: string;
  headers?: Record<string, string>;
  maxTokens: number;
  temperature: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  timeout?: number;
  customHeaders?: Record<string, string>;
}

export interface ProviderResponse {
  id: string;
  model: string;
  content: string | ContentBlock[];
  stopReason: 'end_turn' | 'max_tokens' | 'tool_calls' | 'interrupted';
  toolCalls?: ToolCall[];
  usage: UsageStats;
  reasoning?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  name: string;
  input: Record<string, unknown>;
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface ProviderAdapter {
  initialize(config: ProviderConfig): Promise<void>;
  generate(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    options?: ProviderOptions
  ): Promise<ProviderResponse>;
  supportsStreaming(): boolean;
  streamGenerate(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    onToken: (token: string) => void,
    options?: ProviderOptions
  ): Promise<ProviderResponse>;
}

export interface ProviderOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  reasoningEnabled?: boolean;
  reasoningBudget?: number;
}

// ─── 语言引擎 ───
export enum Language {
  CPP = 'cpp',
  PYTHON = 'python',
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
  GO = 'go',
  RUST = 'rust',
  CSHARP = 'csharp',
  CMAKE = 'cmake',
  POWERSHELL = 'powershell',
  CATIA = 'catia',
}

export enum BuildSystem {
  MAKE = 'make',
  CMAKE = 'cmake',
  NPM = 'npm',
  PNPM = 'pnpm',
  CARGO = 'cargo',
  AUTO = 'auto',
}

export enum InstallSystem {
  APT = 'apt',
  BREW = 'brew',
  PIP = 'pip',
  NPM = 'npm',
  CARGO = 'cargo',
  SYSTEM = 'system',
}

export enum ProblemSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export interface EngineConfig {
  language: Language;
  buildSystem: BuildSystem;
  installSystem: InstallSystem;
  compilerPath?: string;
  compilerFlags?: string[];
  testCommand?: string;
  formatCommand?: string;
  lintCommand?: string;
  environment?: Record<string, string>;
  problemPatterns: ProblemPattern[];
  versionCommand?: string;
  versionRegex?: string;
}

export interface ProblemPattern {
  type: ProblemSeverity;
  pattern: string;
  file: number;
  line: number;
  column?: number;
  message: number;
}

export interface EngineStatus {
  language: Language;
  available: boolean;
  version?: string;
  executablePath?: string;
  lastError?: string;
}

export interface EngineTaskResult {
  success: boolean;
  language: Language;
  output?: string;
  error?: string;
  exitCode?: number;
  problems?: Problem[];
  command?: string;
  duration?: number;
}

export interface Problem {
  file: string;
  line: number;
  column: number;
  severity: ProblemSeverity;
  message: string;
  code?: string;
  tool: string;
}

export interface LanguageEngine {
  init(config: EngineConfig): Promise<void>;
  compile(cwd: string, flags?: string[]): Promise<EngineTaskResult>;
  run(cwd: string, args?: string[]): Promise<EngineTaskResult>;
  test(cwd: string): Promise<EngineTaskResult>;
  format(cwd: string, files?: string[]): Promise<EngineTaskResult>;
  lint(cwd: string): Promise<EngineTaskResult>;
  parseProblems(output: string, stderr?: string): Problem[];
  detectInstallSystem(root: string): InstallSystem;
  detectBuildSystem(root: string): BuildSystem;
  status(): EngineStatus;
}

// ─── 引擎注册表 ───
export interface EngineRegistry {
  register(engine: LanguageEngine): void;
  unregister(language: Language): void;
  get(language: Language): LanguageEngine | undefined;
  getAll(): LanguageEngine[];
  getStatuses(): EngineStatus[];
  findForLanguage(lang: Language): LanguageEngine | undefined;
  findForFile(filePath: string): LanguageEngine | undefined;
  getConfig(language: Language): EngineConfig | undefined;
  initializeAll(): Promise<void>;
}

// ─── 事件系统 ───
export enum AgentEvent {
  SESSION_CREATED = 'session:created',
  SESSION_SWITCHED = 'session:switched',
  SESSION_ENDED = 'session:ended',
  MESSAGE_CREATED = 'message:created',
  TOOL_CALLED = 'tool:called',
  TOOL_APPROVED = 'tool:approved',
  TOOL_COMPLETED = 'tool:completed',
  TOOL_ERROR = 'tool:error',
  AGENT_STARTED = 'agent:started',
  AGENT_COMPLETED = 'agent:completed',
  PROVIDER_ERROR = 'provider:error',
  COMPACTION_STARTED = 'compaction:started',
  COMPACTION_COMPLETED = 'compaction:completed',
  CHECKPOINT_CREATED = 'checkpoint:created',
  THINKING_STARTED = 'thinking:started',
  DEV_MESSAGE_CREATED = 'dev:message',
}

export interface EventPayload {
  sessionId?: string;
  message?: AgentMessage;
  tool?: string;
  error?: Error;
  timestamp: number;
}

// ─── 权限系统 ───
export enum PermissionLevel {
  DEFAULT = 'default',
  ALWAYS_ALLOW = 'always_allow',
  ALWAYS_DENY = 'always_deny',
  ASK = 'ask',
  UNDECIDED = 'undecided',
}

export interface PermissionEntry {
  tool: string;
  level: PermissionLevel;
  pattern?: string;
  folder?: string;
}

// ─── Compaction ───
export enum CompactionStrategy {
  TOKEN_AWARE = 'token_aware',
  FREQUENCY_WEIGHTED = 'frequency_weighted',
  MERGE = 'merge',
  SUMMARIZE = 'summarize',
  HYBRID = 'hybrid',
}

export interface CompactionConfig {
  strategy: CompactionStrategy;
  maxInputTokens: number;
  targetTokens: number;
  minTokens: number;
  keepSystemPrompt: boolean;
  keepToolDefinitions: boolean;
  keepErrorMessages: boolean;
  keepThinking: boolean;
}

// ─── 检查点 ───
export interface Checkpoint {
  id: string;
  sessionId: string;
  messageIds: string[];
  cwd: string;
  filesSnapshot: FileSnapshot[];
  gitStatus?: string;
  createdAt: number;
}

export interface FileSnapshot {
  path: string;
  content: string;
  timestamp: number;
}

// ─── Skill ───
export interface Skill {
  name: string;
  category?: string;
  path: string;
  content: string;
  context: string;
  files?: string[];
  variables?: string[];
}

// ─── MCP ───
export enum MCPType {
  STDIO = 'stdio',
  HTTP = 'http',
}

export interface MCPConfig {
  name: string;
  type: MCPType;
  command?: string;
  args?: string[];
  url?: string;
  transport?: 'stdio' | 'http';
  transportOptions?: Record<string, unknown>;
}

// ─── 任务 ───
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export interface Task {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  commands: string[];
  files: string[];
  expectedFiles?: string[];
  dependencies: string[];
  permission?: PermissionLevel;
  requiresApproval?: boolean;
  estimatedCost?: number;
  estimatedTime?: number;
  parentTaskId?: string;
  groupId?: string;
}

export interface TaskGroup {
  id: string;
  name: string;
  description: string;
  tasks: string[];
  status: TaskStatus;
}

// ─── 会话 ───
export interface Session {
  id: string;
  title: string;
  provider_id: string;
  model: string;
  message_count: number;
  tools: ToolDefinition[];
  permission_entries: PermissionEntry[];
  settings: Record<string, unknown>;
  current_checkpoint?: string;
  created_at: number;
  updated_at: number;
}

// ─── 文件操作 ───
export interface FileEdit {
  path: string;
  newContent: string;
}

export interface FileEditResult {
  path: string;
  created: boolean;
  linesAdded: number;
  linesRemoved: number;
}

export interface DirectoryEntry {
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: number;
}

// ─── LSP ───
export interface Diagnostic {
  code?: string | number;
  message: string;
  range: DiagnosticRange;
  severity: DiagnosticSeverity;
  source?: string;
}

export interface DiagnosticRange {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  character: number;
}

export enum DiagnosticSeverity {
  ERROR = 1,
  WARNING = 2,
  INFORMATION = 3,
  HINT = 4,
}

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  textEdit?: TextEdit;
}

export enum CompletionKind {
  TEXT = 1,
  METHOD = 2,
  FUNCTION = 3,
  CLASS = 7,
  INTERFACE = 8,
  PROPERTY = 10,
  VARIABLE = 6,
  CONSTANT = 15,
  MODULE = 9,
  SNIPPET = 19,
}

export interface TextEdit {
  range: DiagnosticRange;
  newText: string;
}

export interface SignatureHelp {
  activeParameter?: number;
  signatures: SignatureInformation[];
}

export interface SignatureInformation {
  label: string;
  documentation?: string;
  parameters: ParameterInformation[];
  activeParameter?: number;
}

export interface ParameterInformation {
  label: string | [number, number];
  documentation?: string;
}

// ─── 日志 ───
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5,
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  sessionId?: string;
}

// ─── 运行时上下文 ───
export interface RuntimeContext {
  workspaceRoot: string;
  configDir: string;
  projectRoot?: string;
}

export type Logger = {
  trace(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  setLevel(level: string): void;
  getLevel(): LogLevel;
};

// ─── Agent ───
export enum AgentState {
  IDLE = 'idle',
  THINKING = 'thinking',
  EXECUTING = 'executing',
  WAITING_FOR_INPUT = 'waiting_for_input',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface AgentConfig {
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  tools?: string[];
  permissionLevel?: PermissionLevel;
}

export interface Agent {
  id: string;
  name: string;
  state: AgentState;
  config: AgentConfig;
  sessionId?: string;
}

// ─── Message ───
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool',
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// ─── Conversation ───
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  agentId?: string;
  sessionId?: string;
}

export interface ContextWindow {
  messages: Message[];
  totalTokens: number;
  maxTokens: number;
  overflow: boolean;
}

// ─── File Operations ───
export interface FileContent {
  path: string;
  content: string;
  encoding?: string;
}

export interface FileEntry {
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  match: string;
}

// ─── Compaction ───
export interface CompactionResult {
  originalMessageCount: number;
  compactedMessageCount: number;
  tokensBefore: number;
  tokensAfter: number;
  tokenReduction: number;
  compressedMessages: string[];
}

// ─── Project Detection ───
export interface ProjectInfo {
  directory: string;
  languages: Language[];
  buildSystem: BuildSystem | null;
  packageManager: string | null;
  configFile?: string;
  detectedFiles: string[];
}
