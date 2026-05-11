import { StateGraph, END, Annotation } from "@langchain/langgraph";
import type { ContentBlock } from "@halfcopilot/provider";
import type { AgentConfig, AgentEvent, AgentMode } from "./types.js";
import { AgentState as AS } from "./types.js";

const PLAN_SAFE_TOOLS = ["file_read", "grep", "glob", "list_files"];

// ── State Definition ──
const AgentAnnotation = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  turnCount: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
  toolErrors: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
});
type GraphState = typeof AgentAnnotation.State;

// ── Helpers ──
function buildSystemPrompt(model: string, provider: string, mode: string): string {
  const base = `You are HalfCopilot, an AI assistant built by half, powered by ${model} (${provider}).
You have access to tools: file_read, file_write, file_edit, bash, grep, glob.
Reply in the same language as the user. Be concise and direct.`;
  let p = base + `\n\n## Session\n- Model: ${model} (${provider})\n- Mode: ${mode}\n- Built by: half`;
  if (mode === "plan") p += "\n\nYou are in PLAN mode. Only read/search tools allowed.";
  return p;
}

function isRetryable(err: Error): boolean {
  return /429|5\d{2}|timeout|econnreset|etimedout|socket|network|econnrefused/i.test(err.message);
}

// ── Agent Execution ──
export async function* runAgent(
  userMessage: string,
  config: AgentConfig,
): AsyncGenerator<AgentEvent> {
  // Build tool defs
  const llmTools: Array<{ name: string; description: string; inputSchema: any }> = [];
  for (const name of config.tools.list()) {
    if (config.mode === "plan" && !PLAN_SAFE_TOOLS.includes(name)) continue;
    const tool = config.tools.get(name);
    llmTools.push({ name, description: tool.description, inputSchema: tool.inputSchema });
  }

  // ── Graph Nodes ──
  async function agentNode(state: GraphState): Promise<Partial<GraphState>> {
    const systemPrompt = buildSystemPrompt(
      config.model, config.providerName ?? "unknown", config.mode ?? "auto",
    );

    let fullText = "";
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const toolResults: Array<{ id: string; output: string; isError: boolean }> = [];
    let hasToolUse = false;

    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const stream = config.provider.chat({
          model: config.model,
          messages: state.messages,
          tools: llmTools,
          systemPrompt,
          maxTokens: 16384,
        });
        for await (const ev of stream) {
          if (ev.type === "text") fullText += ev.content;
          if (ev.type === "tool_use") {
            hasToolUse = true;
            toolCalls.push({ id: ev.id, name: ev.name, input: ev.input });
            try {
              const result = await config.executor.execute(ev.name, ev.input, {
                projectRoot: process.cwd(), workingDirectory: process.cwd(),
                signal: new AbortController().signal, sessionId: "default",
              });
              toolResults.push({ id: ev.id, output: result.output, isError: !!result.error });
            } catch (err) {
              toolResults.push({ id: ev.id, output: err instanceof Error ? err.message : String(err), isError: true });
            }
          }
          if (ev.type === "error") throw ev.error ?? new Error("Provider error");
        }
        break;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (attempt >= 3 || !isRetryable(error)) throw error;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 1000));
      }
    }

    const newMsgs: any[] = [];
    if (hasToolUse) {
      const blocks: ContentBlock[] = [];
      if (fullText) blocks.push({ type: "text", text: fullText });
      for (const tc of toolCalls) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      newMsgs.push({ role: "assistant", content: blocks });
      for (const tr of toolResults) newMsgs.push({ role: "tool_result", toolUseId: tr.id, content: tr.output, isError: tr.isError });
    } else if (fullText) {
      newMsgs.push({ role: "assistant", content: fullText });
    }

    const errorCount = toolResults.filter((r) => r.isError).length;
    return { messages: newMsgs, turnCount: 1, toolErrors: errorCount };
  }

  function routeAfterAgent(state: GraphState): "agent" | "__end__" {
    const maxTurns = config.maxTurns ?? 50;
    if (state.turnCount >= maxTurns) return "__end__";

    const last = state.messages[state.messages.length - 1];
    if (!last) return "__end__";
    if (last.role === "assistant" && Array.isArray(last.content)) {
      // Had tool calls → agent needs another turn
      return "agent";
    }
    return "__end__";
  }

  // ── Compile Graph ──
  const graph = new StateGraph(AgentAnnotation)
    .addNode("agent", agentNode)
    .addConditionalEdges("agent", routeAfterAgent, {
      agent: "agent",
      __end__: END,
    })
    .addEdge("__start__", "agent");

  const app = graph.compile();

  // ── Stream Execution ──
  yield { type: "state_change", state: AS.THINKING };

  const initialState: GraphState = {
    messages: [{ role: "user", content: userMessage }],
    turnCount: 0,
    toolErrors: 0,
  };

  // Use stream() to get each step's state updates
  for await (const step of await app.stream(initialState)) {
    // step = { agent: { messages: [...], ... } } or { __end__: ... }
    const update = step as Record<string, any>;
    const nodeName = Object.keys(update)[0];

    if (nodeName === "agent") {
      const nodeOutput = update.agent;
      if (!nodeOutput?.messages) continue;

      for (const msg of nodeOutput.messages) {
        if (msg.role === "assistant") {
          if (typeof msg.content === "string") {
            yield { type: "text", content: msg.content };
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text") yield { type: "text", content: block.text };
            }
          }
          if (nodeOutput.toolErrors > 0) {
            yield { type: "warning", content: `${nodeOutput.toolErrors} tool(s) returned errors` };
          }
        }
        if (msg.role === "tool_result") {
          yield { type: "tool_result", toolName: msg.toolUseId ?? "tool", toolOutput: msg.content };
        }
      }

      if (nodeOutput.turnCount >= (config.maxTurns ?? 50)) {
        yield { type: "warning", content: `Max turns (${config.maxTurns}) reached.` };
      }
    }

    if (nodeName === "__end__" || Object.keys(update).length === 0) {
      break;
    }
  }

  yield { type: "state_change", state: AS.IDLE };
  yield { type: "done" };
}
