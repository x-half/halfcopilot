import React from 'react';
import { Box, Text } from 'ink';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
}

interface ChatViewProps {
  messages: Message[];
}

export const ChatView: React.FC<ChatViewProps> = ({ messages }) => {
  return (
    <Box flexDirection="column" padding={1}>
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1}>
          {msg.role === 'user' && (
            <Box>
              <Text color="green" bold>{'❯ '}</Text>
              <Text color="white">{msg.content}</Text>
            </Box>
          )}
          {msg.role === 'assistant' && (
            <Box>
              <Text color="blue" bold>{'🤖 '}</Text>
              <Text color="white">{msg.content}</Text>
            </Box>
          )}
          {msg.role === 'tool' && (
            <Box>
              <Text color="yellow" bold>{'🔧 '}</Text>
              <Text color="yellow">[{msg.toolName}] </Text>
              <Text color="gray">{msg.content.slice(0, 100)}{msg.content.length > 100 ? '...' : ''}</Text>
            </Box>
          )}
          {msg.role === 'system' && (
            <Box>
              <Text color="gray" italic>{msg.content}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};
