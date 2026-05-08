import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { HalfCopilotConfigSchema, type HalfCopilotConfig } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';

const PROJECT_CONFIG_DIR = '.halfcopilot';
const USER_CONFIG_DIR = '.halfcopilot';
const CONFIG_FILE = 'settings.json';

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function loadConfig(projectRoot?: string): HalfCopilotConfig {
  let config: Record<string, unknown> = { ...DEFAULT_CONFIG };

  const userConfigPath = join(homedir(), USER_CONFIG_DIR, CONFIG_FILE);
  const userConfig = readJsonFile(userConfigPath);
  if (userConfig) {
    config = deepMerge(config, userConfig);
  }

  if (projectRoot) {
    const projectConfigPath = join(projectRoot, PROJECT_CONFIG_DIR, CONFIG_FILE);
    const projectConfig = readJsonFile(projectConfigPath);
    if (projectConfig) {
      config = deepMerge(config, projectConfig);
    }
  }

  const envOverrides = loadEnvOverrides();
  if (Object.keys(envOverrides).length > 0) {
    config = deepMerge(config, envOverrides);
  }

  const result = HalfCopilotConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid HalfCopilot config: ${result.error.message}`);
  }
  return result.data;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadEnvOverrides(): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const prefix = 'HALFCOPILOT_';
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value !== undefined) {
      const configKey = key.slice(prefix.length).toLowerCase();
      overrides[configKey] = value;
    }
  }
  return overrides;
}

export function getConfigDir(scope: 'user' | 'project', projectRoot?: string): string {
  if (scope === 'user') {
    return join(homedir(), USER_CONFIG_DIR);
  }
  if (!projectRoot) throw new Error('projectRoot required for project scope');
  return join(projectRoot, PROJECT_CONFIG_DIR);
}
