import prompts from "prompts";

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
  const response = await prompts({
    type: 'text',
    name: 'value',
    message,
    initial: defaultValue,
  });
  return response.value || '';
}

/** Yes/No confirmation, defaults to No (safe default). */
export async function promptConfirm(
  message: string,
  defaultValue = false,
): Promise<boolean> {
  const response = await prompts({
    type: 'confirm',
    name: 'value',
    message,
    initial: defaultValue,
  });
  return response.value || false;
}

/** Single-selection list. */
export async function promptSelect<T extends string>(
  message: string,
  choices: SelectChoice<T>[],
): Promise<T> {
  const response = await prompts({
    type: 'select',
    name: 'value',
    message,
    choices: choices.map((c) => ({
      title: c.name,
      value: c.value,
      description: c.description,
    })),
  });
  return response.value as T;
}

/** Multi-selection checkbox list. */
export async function promptMultiselect<T extends string>(
  message: string,
  choices: SelectChoice<T>[],
): Promise<T[]> {
  const response = await prompts({
    type: 'multiselect',
    name: 'value',
    message,
    choices: choices.map((c) => ({
      title: c.name,
      value: c.value,
      description: c.description,
    })),
  });
  return response.value as T[];
}

/** Masked password / API key input. */
export async function promptSecret(message: string): Promise<string> {
  const response = await prompts({
    type: 'password',
    name: 'value',
    message,
    mask: '*',
  });
  return response.value || '';
}

// ─── Convenience ─────────────────────────────────────────────────────────────

/** Ask "Apply these changes? (y/N)" — used by rewrite + run commands. */
export async function promptApplyChanges(file: string): Promise<boolean> {
  return promptConfirm(`Apply changes to ${file}?`, false);
}
