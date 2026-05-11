import type { AgentConfig, AgentEvent, AgentMode } from "./types.js";
import { AgentState } from "./types.js";
import { runAgent } from "./langgraph-agent.js";

export class AgentLoop {
  private config: AgentConfig;
  private currentMode: AgentMode;
  private currentState: AgentState = AgentState.IDLE;

  constructor(config: AgentConfig) {
    this.config = config;
    this.currentMode = config.mode ?? "auto";
  }

  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    yield* runAgent(userMessage, this.config);
  }

  getMode(): AgentMode {
    return this.currentMode;
  }

  setMode(mode: AgentMode): void {
    this.currentMode = mode;
  }

  getState(): AgentState {
    return this.currentState;
  }
}
