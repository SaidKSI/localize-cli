import { input, confirm, select, checkbox, password } from "prompts";

// ─── Re-export typed wrappers ─────────────────────────────────────────────────
// Thin wrappers that enforce consistent styling and reduce boilerplate
// in command implementations.

export interface SelectChoice<T extends string = string> {
  name: string;
  value: T;
  description?: string;
}

/** Free-text input with optional default value. */
export async function promptInput(
  message: string,
  defaultValue?: string,
): Promise<string> {
  const opts: { message: string; default?: string } = { message };
  if (defaultValue !== undefined) opts.default = defaultValue;
  return input(opts);
}

/** Yes/No confirmation, defaults to No (safe default). */
export async function promptConfirm(
  message: string,
  defaultValue = false,
): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

/** Single-selection list. */
export async function promptSelect<T extends string>(
  message: string,
  choices: SelectChoice<T>[],
): Promise<T> {
  return select({ message, choices }) as Promise<T>;
}

/** Multi-selection checkbox list. */
export async function promptMultiselect<T extends string>(
  message: string,
  choices: SelectChoice<T>[],
): Promise<T[]> {
  return checkbox({ message, choices }) as Promise<T[]>;
}

/** Masked password / API key input. */
export async function promptSecret(message: string): Promise<string> {
  return password({ message, mask: "*" });
}

// ─── Convenience ─────────────────────────────────────────────────────────────

/** Ask "Apply these changes? (y/N)" — used by rewrite + run commands. */
export async function promptApplyChanges(file: string): Promise<boolean> {
  return promptConfirm(`Apply changes to ${file}?`, false);
}
