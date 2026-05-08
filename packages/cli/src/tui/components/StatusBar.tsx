import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  provider: string;
  model: string;
  mode: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export const StatusBar: React.FC<StatusBarProps> = ({ provider, model, mode, tokenUsage }) => {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box marginRight={2}>
        <Text color="cyan">Provider:</Text>
        <Text color="white" bold> {provider}</Text>
      </Box>
      <Box marginRight={2}>
        <Text color="cyan">Model:</Text>
        <Text color="white" bold> {model}</Text>
      </Box>
      <Box marginRight={2}>
        <Text color="cyan">Mode:</Text>
        <Text color="yellow" bold> {mode}</Text>
      </Box>
      {tokenUsage && (
        <Box>
          <Text color="cyan">Tokens:</Text>
          <Text color="green"> {tokenUsage.inputTokens}↓ {tokenUsage.outputTokens}↑</Text>
        </Box>
      )}
    </Box>
  );
};
