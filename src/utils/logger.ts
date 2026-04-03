import chalk from "chalk";

// ─── Core output helpers ──────────────────────────────────────────────────────

export const logger = {
  success: (msg: string) => console.log(chalk.green("  ✔"), msg),
  error:   (msg: string) => console.error(chalk.red("  ✖"), msg),
  warn:    (msg: string) => console.warn(chalk.yellow("  ⚠"), msg),
  info:    (msg: string) => console.log(chalk.blue("  ℹ"), msg),
  dim:     (msg: string) => console.log(chalk.dim(`    ${msg}`)),
  blank:   ()            => console.log(),
  raw:     (msg: string) => console.log(msg),

  /** Pipeline step header: [1/4] Scanning... */
  step: (n: number, total: number, msg: string) =>
    console.log(chalk.cyan(`\n  [${n}/${total}]`), chalk.bold(msg)),

  /** Indented detail line below a step */
  detail: (msg: string) => console.log(`        ${msg}`),

  /** Bold section header */
  header: (msg: string) => console.log(chalk.bold(`\n${msg}`)),

  /** Fatal error — prints message and exits with code 1 */
  fatal: (msg: string): never => {
    console.error(chalk.red.bold("\n  Error:"), msg);
    process.exit(1);
  },
};

// ─── Coverage progress bar ────────────────────────────────────────────────────

const BAR_WIDTH = 20;
const FILLED = "█";
const EMPTY  = "░";

/**
 * Render a coverage bar for the validate / status command output.
 *
 * progressBar("fr", 100, 312, 0)
 * → "  fr    ████████████████████  100%  (312 keys)"
 *
 * progressBar("ar", 57, 312, 134)
 * → "  ar    ███████████░░░░░░░░░   57%  (178 keys)  ← 134 missing"
 */
export function progressBar(
  lang: string,
  percent: number,
  totalKeys: number,
  missingCount: number,
): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const bar = FILLED.repeat(filled) + EMPTY.repeat(BAR_WIDTH - filled);

  const pct = `${percent}%`.padStart(4);
  const langPad = lang.padEnd(6);
  const presentKeys = totalKeys - missingCount;
  const keyInfo = `(${presentKeys} keys)`;
  const missing =
    missingCount > 0
      ? chalk.yellow(`  ← ${missingCount} missing`)
      : chalk.green("  ✔");

  return `  ${langPad}  ${bar}  ${pct}  ${keyInfo}${missing}`;
}
