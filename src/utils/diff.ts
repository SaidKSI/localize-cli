import chalk from "chalk";

/**
 * Print a colorized diff to the terminal.
 * - Lines starting with "-" → red
 * - Lines starting with "+" → green
 * - "---" / "+++" headers → bold dim
 * - "@@" separators → cyan
 * - Context lines → dim
 */
export function printDiff(diff: string): void {
  if (!diff) return;
  for (const line of diff.split("\n")) {
    if (line.startsWith("---") || line.startsWith("+++")) {
      console.log(chalk.bold.dim(line));
    } else if (line.startsWith("@@")) {
      console.log(chalk.cyan(line));
    } else if (line.startsWith("- ")) {
      console.log(chalk.red(line));
    } else if (line.startsWith("+ ")) {
      console.log(chalk.green(line));
    } else {
      console.log(chalk.dim(line));
    }
  }
}
