import type { HalfCopilotConfig } from './schema.js';

export const DEFAULT_CONFIG: HalfCopilotConfig = {
  providers: {},
  mode: 'auto',
  maxTurns: 50,
  maxTokens: 16384,
  permissions: {
    allow: [],
    deny: [],
    autoApproveSafe: true,
  },
  security: {
    autoApprove: [],
    neverApprove: [],
    protectedPaths: ['/etc', '/System', '~/.ssh', '~/.gnupg'],
    sensitivePatterns: ['.env', '.env.*', '*.pem', '*.key', '*credentials*'],
    audit: {
      enabled: true,
      path: '~/.halfcopilot/audit.log',
    },
  },
  mcpServers: {},
  memory: {
    enabled: true,
    maxSize: 100,
    compactionThreshold: 0.8,
  },
  theme: 'dark',
  verbose: false,
};
