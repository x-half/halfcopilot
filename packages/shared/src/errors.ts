export class HalfCopilotError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    cause?: Error
  ) {
    super(message, { cause });
    this.name = 'HalfCopilotError';
  }
}

export class ProviderError extends HalfCopilotError {
  constructor(
    public readonly provider: string,
    message: string,
    cause?: Error
  ) {
    super('PROVIDER_ERROR', `[${provider}] ${message}`, cause);
    this.name = 'ProviderError';
  }
}

export class ToolError extends HalfCopilotError {
  constructor(
    public readonly tool: string,
    message: string,
    cause?: Error
  ) {
    super('TOOL_ERROR', `[${tool}] ${message}`, cause);
    this.name = 'ToolError';
  }
}

export class PermissionError extends HalfCopilotError {
  constructor(
    public readonly tool: string,
    public readonly reason: string
  ) {
    super('PERMISSION_DENIED', `Permission denied for ${tool}: ${reason}`);
    this.name = 'PermissionError';
  }
}
