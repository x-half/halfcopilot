import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  provider: string;
  model: string;
  mode: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  turnInfo?: {
    current: number;
    max: number;
  };
  responseTime?: number;
}

const modeColors: Record<string, string> = {
  plan: "blue",
  act: "yellow",
  auto: "green",
  review: "magenta",
};

export const StatusBar: React.FC<StatusBarProps> = ({
  provider,
  model,
  mode,
  tokenUsage,
  turnInfo,
  responseTime,
}) => {
  const [elapsed, setElapsed] = useState("0s");

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      if (s < 60) setElapsed(`${s}s`);
      else setElapsed(`${Math.floor(s / 60)}m${s % 60}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} paddingY={0}>
      <Box marginRight={2}>
        <Text color="cyan">P:</Text>
        <Text color="white" bold>
          {" "}
          {provider}
        </Text>
      </Box>
      <Box marginRight={2}>
        <Text color="cyan">M:</Text>
        <Text color="white" bold>
          {" "}
          {model}
        </Text>
      </Box>
      <Box marginRight={1}>
        <Text color={modeColors[mode] || "cyan"} bold>
          [{mode.toUpperCase()}]
        </Text>
      </Box>
      {tokenUsage &&
        (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0) && (
          <Box marginRight={2}>
            <Text color="green">
              {tokenUsage.inputTokens}↓{tokenUsage.outputTokens}↑
            </Text>
          </Box>
        )}
      {turnInfo && turnInfo.max > 0 && (
        <Box marginRight={2}>
          <Text color="gray">
            {turnInfo.current}/{turnInfo.max}
          </Text>
        </Box>
      )}
      {responseTime !== undefined && responseTime > 0 && (
        <Box marginRight={2}>
          <Text color="gray">{(responseTime / 1000).toFixed(1)}s</Text>
        </Box>
      )}
      <Box>
        <Text color="gray">{elapsed}</Text>
      </Box>
    </Box>
  );
};
