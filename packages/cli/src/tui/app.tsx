import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { StatusBar, ChatView, InputField, ToolApproval } from './components/index.js';
import type { AgentLoop, AgentEvent } from '@halfcopilot/core';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
}

interface AppProps {
  agent: AgentLoop;
  providerName: string;
  model: string;
  mode: string;
}

export const App: React.FC<AppProps> = ({ agent, providerName, model, mode }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState(mode);
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0 });
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    toolInput: Record<string, unknown>;
  } | null>(null);

  const handleSubmit = useCallback(async (input: string) => {
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      exit();
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setIsLoading(true);

    try {
      let fullText = '';
      for await (const event of agent.run(input)) {
        switch (event.type) {
          case 'text':
            fullText += event.content ?? '';
            break;
          case 'tool_use':
            setMessages(prev => [...prev, {
              role: 'tool',
              content: JSON.stringify(event.toolInput),
              toolName: event.toolName,
            }]);
            break;
          case 'tool_result':
            setMessages(prev => [...prev, {
              role: 'tool',
              content: event.toolOutput ?? '',
              toolName: event.toolName,
            }]);
            break;
          case 'done':
            if (event.usage) {
              setTokenUsage(prev => ({
                inputTokens: prev.inputTokens + event.usage!.inputTokens,
                outputTokens: prev.outputTokens + event.usage!.outputTokens,
              }));
            }
            break;
          case 'error':
            setMessages(prev => [...prev, {
              role: 'system',
              content: `Error: ${event.error?.message}`,
            }]);
            break;
        }
      }

      if (fullText) {
        setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error: ${err instanceof Error ? err.message : err}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [agent, exit]);

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        provider={providerName}
        model={model}
        mode={currentMode}
        tokenUsage={tokenUsage}
      />
      <Box flexDirection="column" flexGrow={1}>
        <ChatView messages={messages} />
      </Box>
      {pendingApproval ? (
        <ToolApproval
          toolName={pendingApproval.toolName}
          toolInput={pendingApproval.toolInput}
          onApprove={() => setPendingApproval(null)}
          onReject={() => setPendingApproval(null)}
        />
      ) : (
        <InputField onSubmit={handleSubmit} isLoading={isLoading} />
      )}
    </Box>
  );
};
