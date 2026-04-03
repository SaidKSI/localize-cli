import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import type { LocalizeConfig, AIProvider } from "@localize/core";

// ─── Paths ─────────────────────────────────────────────────────────────────────

const LOCALIZE_DIR    = ".localize";
const CONFIG_FILENAME = "config.json";
const KEYS_FILENAME   = ".keys";
const GITIGNORE_ENTRY = ".keys\ncache.json\n";

// ─── Project config (.localize/config.json) ───────────────────────────────────

/**
 * Load the project config from `{cwd}/.localize/config.json`.
 * Throws a user-friendly error if no config is found.
 */
export async function loadConfig(cwd = process.cwd()): Promise<LocalizeConfig> {
  const configPath = resolve(cwd, LOCALIZE_DIR, CONFIG_FILENAME);
  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as LocalizeConfig;
  } catch {
    throw new Error(
      "No config found. Run `localize init` to create .localize/config.json",
    );
  }
}

/**
 * Write a full project config to `{cwd}/.localize/config.json`.
 * Creates the `.localize/` directory if needed and writes a `.gitignore` inside it.
 */
export async function writeProjectConfig(
  config: LocalizeConfig,
  cwd = process.cwd(),
): Promise<void> {
  const localizeDir = resolve(cwd, LOCALIZE_DIR);
  await mkdir(localizeDir, { recursive: true });

  const configPath = join(localizeDir, CONFIG_FILENAME);
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Ensure .gitignore inside .localize/ to protect .keys and cache
  const gitignorePath = join(localizeDir, ".gitignore");
  try {
    await readFile(gitignorePath, "utf-8");
    // Already exists — leave it
  } catch {
    await writeFile(gitignorePath, GITIGNORE_ENTRY, "utf-8");
  }
}

// ─── API key (.localize/.keys) ────────────────────────────────────────────────

interface KeysFile {
  anthropic?: string;
  openai?: string;
}

function keysFilePath(cwd: string): string {
  return resolve(cwd, LOCALIZE_DIR, KEYS_FILENAME);
}

async function loadKeysFile(cwd: string): Promise<KeysFile> {
  try {
    const content = await readFile(keysFilePath(cwd), "utf-8");
    return JSON.parse(content) as KeysFile;
  } catch {
    return {};
  }
}

/**
 * Save an API key to `{cwd}/.localize/.keys`.
 * Merges into existing entries (does not overwrite other provider keys).
 */
export async function saveApiKey(
  provider: AIProvider,
  key: string,
  cwd = process.cwd(),
): Promise<void> {
  const localizeDir = resolve(cwd, LOCALIZE_DIR);
  await mkdir(localizeDir, { recursive: true });

  const existing = await loadKeysFile(cwd);
  const updated: KeysFile = { ...existing, [provider]: key };
  await writeFile(keysFilePath(cwd), JSON.stringify(updated, null, 2) + "\n", "utf-8");
}

/**
 * Retrieve the API key for the configured provider.
 * Checks in order:
 *   1. Environment variable (ANTHROPIC_API_KEY / OPENAI_API_KEY)
 *   2. {cwd}/.localize/.keys
 *
 * Returns null if no key is found.
 */
export async function getApiKey(
  provider: AIProvider,
  cwd = process.cwd(),
): Promise<string | null> {
  const envKey =
    provider === "anthropic"
      ? process.env["ANTHROPIC_API_KEY"]
      : process.env["OPENAI_API_KEY"];

  if (envKey) return envKey;

  const keys = await loadKeysFile(cwd);
  return keys[provider] ?? null;
}

/**
 * Like getApiKey but throws a user-friendly error if no key is found.
 */
export async function requireApiKey(
  provider: AIProvider,
  cwd = process.cwd(),
): Promise<string> {
  const key = await getApiKey(provider, cwd);
  if (!key) {
    const envVar =
      provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    throw new Error(
      `No API key found for ${provider}.\n` +
        `  Set ${envVar} in your environment, or run \`localize init\` to save one.`,
    );
  }
  return key;
}
