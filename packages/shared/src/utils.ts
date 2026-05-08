export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function resolveEnvVar(value: string): string {
  if (value.startsWith('env:')) {
    const envKey = value.slice(4);
    const envVal = process.env[envKey];
    if (!envVal) {
      throw new Error(`Environment variable ${envKey} is not set`);
    }
    return envVal;
  }
  return value;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
