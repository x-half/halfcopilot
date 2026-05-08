import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ToolApprovalProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
}

export const ToolApproval: React.FC<ToolApprovalProps> = ({ toolName, toolInput, onApprove, onReject }) => {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onApprove();
    } else if (input === 'n' || input === 'N') {
      onReject();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" padding={1}>
      <Text color="yellow" bold>⚠️  Tool Execution Request</Text>
      <Box marginTop={1}>
        <Text color="cyan">Tool: </Text>
        <Text color="white" bold>{toolName}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">Input: </Text>
        <Text color="gray">{JSON.stringify(toolInput, null, 2)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green">[Y] Approve</Text>
        <Text color="gray">  </Text>
        <Text color="red">[N] Reject</Text>
      </Box>
    </Box>
  );
};
