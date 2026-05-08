import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputFieldProps {
  onSubmit: (input: string) => void;
  isLoading?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({ onSubmit, isLoading }) => {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
        setValue('');
      }
    } else if (key.backspace || key.delete) {
      setValue(prev => prev.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setValue(prev => prev + input);
    }
  });

  return (
    <Box borderStyle="single" borderColor="green" paddingX={1}>
      <Text color="green" bold>{'❯ '}</Text>
      <Text color="white">{value}</Text>
      {isLoading ? (
        <Text color="yellow"> ⏳</Text>
      ) : (
        <Text color="gray">█</Text>
      )}
    </Box>
  );
};
