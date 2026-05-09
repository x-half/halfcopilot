import React from "react";
import { Box, Text, useInput } from "ink";

interface ToolApprovalProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  permissionLevel?: "SAFE" | "WARN" | "UNSAFE";
  onApprove: () => void;
  onReject: () => void;
}

const PERMISSION_INDICATORS: Record<
  string,
  { emoji: string; color: string; label: string }
> = {
  SAFE: { emoji: "🟢", color: "green", label: "SAFE" },
  WARN: { emoji: "🟡", color: "yellow", label: "WARN" },
  UNSAFE: { emoji: "🔴", color: "red", label: "UNSAFE" },
};

export const ToolApproval: React.FC<ToolApprovalProps> = ({
  toolName,
  toolInput,
  permissionLevel = "WARN",
  onApprove,
  onReject,
}) => {
  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      onApprove();
    } else if (input === "n" || input === "N") {
      onReject();
    }
  });

  const indicator = PERMISSION_INDICATORS[permissionLevel];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={indicator.color as any}
      padding={1}
    >
      <Box>
        <Text color="yellow" bold>
          ⚠️ Tool Execution Request
        </Text>
        <Text> </Text>
        <Text color={indicator.color as any}>
          {indicator.emoji} {indicator.label}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">Tool: </Text>
        <Text color="white" bold>
          {toolName}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">Input: </Text>
      </Box>
      <Box marginTop={0} paddingLeft={2}>
        {Object.entries(toolInput).map(([key, value]) => (
          <Box key={key}>
            <Text color="gray">{key}: </Text>
            <Text color="white">
              {typeof value === "string" ? value : JSON.stringify(value)}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="green">[Y] Approve</Text>
        <Text color="gray"> </Text>
        <Text color="red">[N] Reject</Text>
      </Box>
    </Box>
  );
};
