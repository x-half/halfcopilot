import type { Provider } from "./base.js";
import { OpenAICompatibleProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import type { HalfCopilotConfig } from "@halfcopilot/config";
import { ProviderError, logger } from "@halfcopilot/shared";

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  register(name: string, provider: Provider): void {
    this.providers.set(name, provider);
  }

  get(name: string): Provider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ProviderError(
        name,
        `Provider "${name}" not found. Available: ${this.list().join(", ")}`,
      );
    }
    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }

  createFromConfig(config: HalfCopilotConfig): void {
    if (!config.providers) return;
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (this.providers.has(name)) continue;

      try {
        if (providerConfig.type === "openai-compatible") {
          // Check if API key is set
          if (providerConfig.apiKey.startsWith("env:")) {
            const envKey = providerConfig.apiKey.slice(4);
            if (!process.env[envKey]) {
              // Skip this provider if env var not set
              continue;
            }
          }
          const provider = OpenAICompatibleProvider.fromConfig(
            name,
            providerConfig,
          );
          this.register(name, provider);
        } else if (providerConfig.type === "anthropic") {
          // Check if API key is set
          if (providerConfig.apiKey.startsWith("env:")) {
            const envKey = providerConfig.apiKey.slice(4);
            if (!process.env[envKey]) {
              // Skip this provider if env var not set
              continue;
            }
          }
          const provider = AnthropicProvider.fromConfig(providerConfig);
          this.register(name, provider);
        }
      } catch (err) {
        logger.warn(`Failed to initialize provider "${name}": ${err}`);
      }
    }
  }
}
