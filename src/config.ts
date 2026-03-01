import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Config, DEFAULT_CONFIG, DIR_NAME, CONFIG_FILE } from "./types.js";

const KEY_MAP: Record<string, keyof Config> = {
  MAX_RETRIES: "maxRetries",
  TIMEOUT_MINUTES: "timeoutMinutes",
  IDLE_TIMEOUT_SECONDS: "idleTimeoutSeconds",
  IDLE_POLL_SECONDS: "idlePollSeconds",
  TASK_DELAY_SECONDS: "taskDelaySeconds",
};

export function parseConfigFile(content: string): Partial<Config> {
  const result: Partial<Config> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    const configKey = KEY_MAP[key];

    if (!configKey) continue;

    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      result[configKey] = num;
    }
  }

  return result;
}

export function loadConfig(projectDir: string): Config {
  const configPath = join(projectDir, DIR_NAME, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const content = readFileSync(configPath, "utf-8");
  const overrides = parseConfigFile(content);

  return { ...DEFAULT_CONFIG, ...overrides };
}
