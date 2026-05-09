import React, { Fragment } from "react";
import { Box, Text } from "ink";

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
}

interface ChatViewProps {
  messages: Message[];
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const lines = code.split("\n");
  return (
    <Box flexDirection="column" marginLeft={2} marginY={0}>
      {language && (
        <Box>
          <Text color="gray">{language}</Text>
        </Box>
      )}
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color="gray">│ </Text>
          <Text color="white">{line}</Text>
        </Box>
      ))}
    </Box>
  );
}

function formatContent(content: string): React.ReactNode[] {
  const parts = content.split(/(```[\s\S]*?```)/);
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const part of parts) {
    if (part.startsWith("```")) {
      const code = part
        .replace(/```(\w*)\n?/, (_, lang) => {
          nodes.push(<CodeBlock key={key++} code={""} language={lang} />);
          return "";
        })
        .replace(/```$/, "");
      const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
      if (match) {
        nodes.push(
          <CodeBlock
            key={key++}
            code={match[2]}
            language={match[1] || undefined}
          />,
        );
      }
    } else if (part) {
      nodes.push(<Text key={key++}>{part}</Text>);
    }
  }

  if (nodes.length === 0) {
    nodes.push(<Text key={0}>{content}</Text>);
  }
  return nodes;
}

export const ChatView: React.FC<ChatViewProps> = ({ messages }) => {
  // Group consecutive same-role messages
  const grouped: { role: Message["role"]; contents: Message[] }[] = [];
  for (const msg of messages) {
    const last = grouped[grouped.length - 1];
    if (last && last.role === msg.role && msg.role !== "tool") {
      last.contents.push(msg);
    } else {
      grouped.push({ role: msg.role, contents: [msg] });
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      {grouped.map((group, gi) => (
        <Box key={gi} marginBottom={1} flexDirection="column">
          {group.role === "user" && (
            <Box>
              <Text color="green" bold>
                {"❯ "}
              </Text>
              <Text color="white">{group.contents[0].content}</Text>
            </Box>
          )}
          {group.role === "assistant" && (
            <Box flexDirection="column">
              <Box marginBottom={0}>
                <Text color="blue" bold>
                  {"● "}
                </Text>
                {group.contents.map((msg, i) => (
                  <Fragment key={i}>{formatContent(msg.content)}</Fragment>
                ))}
              </Box>
            </Box>
          )}
          {group.role === "tool" && (
            <Box flexDirection="column">
              {group.contents.map((msg, i) => (
                <Box key={i}>
                  <Text color="cyan" bold>
                    {"🔧 "}
                  </Text>
                  <Text color="cyan">[{msg.toolName}] </Text>
                  <Text color="gray">
                    {msg.content.slice(0, 120)}
                    {msg.content.length > 120 ? "..." : ""}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
          {group.role === "system" && (
            <Box>
              <Text color="gray">
                {group.contents.map((m) => m.content).join("\n")}
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};
