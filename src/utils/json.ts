/** Flatten a nested JSON object to { "dot.notation.key": "value" } pairs. */
export function flattenJson(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      Object.assign(result, flattenJson(v as Record<string, unknown>, fullKey));
    } else if (typeof v === "string") {
      result[fullKey] = v;
    }
  }
  return result;
}
