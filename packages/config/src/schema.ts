import { z } from "zod";

const nonEmptyString = (msg = "String cannot be empty") =>
  z.string().min(1, msg).refine(
    (val) => val.trim().length > 0,
    { message: msg }
  );

const urlString = (msg = "Invalid URL format") =>
  nonEmptyString(msg).refine(
    (val) => {
      try {
        const url = new URL(val);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must use http or https protocol" },
  );

export const ModelConfigSchema = z.object({
  contextWindow: z.number().positive(),
  maxOutput: z.number().positive(),
  thinking: z.boolean().optional().default(false),
});

export const ProviderConfigSchema = z.object({
  type: z.enum(["openai-compatible", "anthropic"]),
  baseUrl: urlString().optional(),
  apiKey: nonEmptyString("API key cannot be empty"),
  models: z.record(z.string(), ModelConfigSchema),
});

export const MCPServerConfigSchema = z.object({
  command: nonEmptyString("Command cannot be empty"),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional(),
  transport: z.enum(["stdio", "sse"]).optional().default("stdio"),
  url: urlString().optional(),
});

export const SecurityConfigSchema = z.object({
  autoApprove: z.array(z.string()).optional().default([]),
  neverApprove: z.array(z.string()).optional().default([]),
  protectedPaths: z
    .array(z.string())
    .optional()
    .default(["/etc", "/System", "~/.ssh", "~/.gnupg"]),
  sensitivePatterns: z
    .array(z.string())
    .optional()
    .default([".env", ".env.*", "*.pem", "*.key", "*credentials*"]),
  audit: z
    .object({
      enabled: z.boolean().optional().default(true),
      path: z.string().optional().default("~/.halfcopilot/audit.log"),
    })
    .optional()
    .default({}),
});

export const HalfCopilotConfigSchema = z.object({
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional().default({}),
  mode: z.enum(["plan", "review", "act", "auto"]).optional().default("auto"),
  maxTurns: z.number().positive().optional().default(50),
  maxTokens: z.number().positive().optional().default(16384),
  permissions: z
    .object({
      allow: z.array(z.string()).optional().default([]),
      deny: z.array(z.string()).optional().default([]),
      autoApproveSafe: z.boolean().optional().default(true),
    })
    .optional()
    .default({}),
  security: SecurityConfigSchema.optional().default({}),
  mcpServers: z
    .record(z.string(), MCPServerConfigSchema)
    .optional()
    .default({}),
  memory: z
    .object({
      enabled: z.boolean().optional().default(true),
      maxSize: z.number().positive().optional().default(100),
      compactionThreshold: z.number().min(0).max(1).optional().default(0.8),
    })
    .optional()
    .default({}),
  theme: z.enum(["dark", "light"]).optional().default("dark"),
  verbose: z.boolean().optional().default(false),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type HalfCopilotConfig = z.infer<typeof HalfCopilotConfigSchema>;
