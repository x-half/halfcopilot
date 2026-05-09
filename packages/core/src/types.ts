import type {
  Provider,
  ChatEvent,
  ToolDef,
  TokenUsage,
} from "@halfcopilot/provider";
import type {
  ToolRegistry,
  ToolExecutor,
  PermissionChecker,
} from "@halfcopilot/tools";

export type AgentMode = "plan" | "review" | "act" | "auto";

export enum AgentState {
  IDLE = "idle",
  THINKING = "thinking",
  TOOL_CALLING = "tool_calling",
  TOOL_APPROVAL = "tool_approval",
  COMPACTING = "compacting",
  TIMEOUT = "timeout",
  ERROR = "error",
  PAUSED = "paused",
}

export interface AgentEvent {
  type:
    | "text"
    | "tool_use"
    | "tool_result"
    | "thinking"
    | "done"
    | "error"
    | "mode_change"
    | "state_change"
    | "approval_required"
    | "warning";
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  usage?: TokenUsage;
  mode?: AgentMode;
  state?: AgentState;
  error?: Error;
}

export interface AgentConfig {
  provider: Provider;
  providerName?: string;
  model: string;
  tools: ToolRegistry;
  executor: ToolExecutor;
  permissions: PermissionChecker;
  maxTurns: number;
  mode?: AgentMode;
  systemPrompt?: string;
  onApprovalNeeded?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<boolean>;
}
