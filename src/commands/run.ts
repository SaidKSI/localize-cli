import { Command } from "commander";
import { resolve, relative, basename, extname, dirname } from "path";
import { readFile, stat, readdir } from "fs/promises";
import ora from "ora";
import chalk from "chalk";
import {
  scanFile,
  scanDirectory,
  translateStrings,
  rewriteFile,
  applyRewrite,
  groupResultsByFile,
  resolveKeysFromMessages,
  resolveNamespaces,
  validateCoverage,
  readCache,
  writeCache,
  clearCache,
  isCached,
  markBatchCached,
  type ScanResult,
  type RewriteResult,
  type PipelineResult,
} from "@saidksi/localizer-core";
import { logger, progressBar } from "../utils/logger.js";
import { loadConfig, requireApiKey } from "../utils/config.js";
import { promptApplyChanges } from "../utils/prompt.js";
import { printDiff } from "../utils/diff.js";

// ─── File validation helper ──────────────────────────────────────────────────

/**
 * Find files with similar names (case-insensitive) in the same directory.
 * Useful for suggesting corrections when a file is not found.
 */
async function findSimilarFiles(filePath: string): Promise<string[]> {
  const dir = dirname(filePath);
  const fileName = basename(filePath).toLowerCase();

  try {
    const entries = await readdir(dir);
    return entries.filter((e) => e.toLowerCase() === fileName ||
                                  e.toLowerCase().includes(fileName.replace(/\.(tsx?|jsx?)$/i, "")));
  } catch {
    return [];
  }
}

async function processOneFile(
  filePath: string,
  results: ScanResult[],
  options: RunOptions,
  config: Awaited<ReturnType<typeof import("../utils/config.js").loadConfig>>,
  namespace?: string,
): Promise<RewriteResult> {
  const cwd    = process.cwd();
  const relPath = relative(cwd, filePath);
  const rewrite = await rewriteFile(filePath, results, config, namespace);

  if (rewrite.changesCount === 0) {
    logger.dim(`${relPath} — no changes`);
    return rewrite;
  }

  logger.blank();
  logger.raw(
    `  ${chalk.bold(chalk.cyan(relPath))}  ` +
    chalk.dim(`(${rewrite.changesCount} change${rewrite.changesCount !== 1 ? "s" : ""})`),
  );
  logger.blank();
  printDiff(rewrite.diff);
  logger.blank();

  if (options.dryRun) {
    logger.dim("  Dry run — skipping write.");
    return rewrite;
  }

  if (options.yes) {
    const applied = await applyRewrite(rewrite);
    logger.success(`Applied changes to ${relPath}`);
    return applied;
  }

  const confirmed = await promptApplyChanges(relPath);
  if (confirmed) {
    const applied = await applyRewrite(rewrite);
    logger.success(`Applied changes to ${relPath}`);
    return applied;
  }

  logger.warn(`Skipped ${relPath}`);
  return rewrite;
}

// ─── Command ──────────────────────────────────────────────────────────────────

interface RunOptions {
  file?: string;
  dir?: string;
  lang?: string;
  dryRun?: boolean;
  skipRewrite?: boolean;
  skipValidate?: boolean;
  yes?: boolean;
  force?: boolean;
  ci?: boolean;
}

async function runPipeline(options: RunOptions): Promise<void> {
  const startMs = Date.now();
  const cwd     = process.cwd();

  const config = await loadConfig(cwd).catch((err: unknown) =>
    logger.fatal(err instanceof Error ? err.message : String(err)),
  );
  const apiKey = await requireApiKey(config.aiProvider).catch((err: unknown) =>
    logger.fatal(err instanceof Error ? err.message : String(err)),
  );

  // Build effective config (lang override)
  const langs = options.lang
    ? options.lang.split(",").map((l) => l.trim()).filter(Boolean)
    : config.languages;
  const effectiveConfig = { ...config, languages: langs };

  // Step numbering depends on which steps are active
  const steps = ["scan", "translate"];
  if (!options.skipRewrite)  steps.push("rewrite");
  if (!options.skipValidate) steps.push("validate");
  const total = steps.length;
  let stepIdx = 0;

  // ── Step 1: Scan ─────────────────────────────────────────────────────────────
  stepIdx++;
  logger.step(stepIdx, total, "Scanning for hardcoded strings…");

  // Cache handling
  let cache = await readCache(cwd);
  if (options.force) {
    await clearCache(cwd);
    cache = { version: 1, entries: {} };
    logger.dim("  Cache cleared (--force).");
  }

  const scanSpinner = ora("Scanning…").start();
  let rawResults: ScanResult[] = [];

  try {
    if (options.file) {
      const filePath = resolve(cwd, options.file);
      try {
        await stat(filePath);
      } catch {
        // File not found — provide helpful suggestions
        const similar = await findSimilarFiles(filePath);
        let errorMsg = `File not found: ${relative(cwd, filePath)}`;
        if (similar.length > 0) {
          errorMsg += `\n\n  Did you mean:\n`;
          similar.forEach((f) => {
            errorMsg += `    ${relative(cwd, filePath.substring(0, filePath.lastIndexOf("/")) + "/" + f)}\n`;
          });
        } else {
          errorMsg += `\n\n  Check the file path (case-sensitive on Unix-like systems)`;
        }
        throw new Error(errorMsg);
      }
      rawResults = await scanFile(filePath, effectiveConfig);
    } else if (options.dir) {
      const dirPath = resolve(cwd, options.dir);
      try {
        const stats = await stat(dirPath);
        if (!stats.isDirectory()) {
          throw new Error(`Not a directory: ${relative(cwd, dirPath)}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Not a directory")) {
          throw err;
        }
        throw new Error(`Directory not found: ${relative(cwd, dirPath)}`);
      }
      rawResults = await scanDirectory(dirPath, effectiveConfig);
    } else {
      const all = await Promise.all(
        config.include.map((d) =>
          scanDirectory(resolve(cwd, d), effectiveConfig).catch(() => [] as ScanResult[]),
        ),
      );
      rawResults = all.flat();
    }
  } catch (err: unknown) {
    scanSpinner.fail("Scan failed.");
    logger.fatal(err instanceof Error ? err.message : String(err));
  }

  // Filter out files that haven't changed since last run (cache)
  const allFiles = [...new Set(rawResults.map((r) => r.file))];
  const uncachedFiles = new Set<string>();

  if (!options.force) {
    for (const filePath of allFiles) {
      try {
        const source = await readFile(filePath, "utf-8");
        const relPath = relative(cwd, filePath);
        if (!isCached(cache, relPath, source)) {
          uncachedFiles.add(filePath);
        }
      } catch {
        uncachedFiles.add(filePath);
      }
    }
  } else {
    allFiles.forEach((f) => uncachedFiles.add(f));
  }

  const cachedCount = allFiles.length - uncachedFiles.size;
  const scanResults = rawResults.filter((r) => uncachedFiles.has(r.file));
  const untranslated = scanResults.filter((r) => !r.alreadyTranslated);

  scanSpinner.succeed(
    `Scanned ${allFiles.length} file${allFiles.length !== 1 ? "s" : ""}` +
    (cachedCount > 0 ? chalk.dim(` (${cachedCount} cached, skipped)`) : "") +
    ` — ${untranslated.length} untranslated string${untranslated.length !== 1 ? "s" : ""} found.`,
  );

  const pipeline: PipelineResult = {
    ...(options.file !== undefined && { file: options.file }),
    ...(options.dir !== undefined && { dir: options.dir }),
    scanned: rawResults.length,
    translated: 0,
    rewritten: 0,
    validated: false,
    durationMs: 0,
    aiCostUsd: 0,
  };

  if (untranslated.length === 0 && !options.skipValidate) {
    logger.blank();
    logger.dim("  Nothing new to translate.");
  }

  // ── Step 2: Translate ─────────────────────────────────────────────────────────
  stepIdx++;
  logger.blank();
  logger.step(stepIdx, total, "Translating…");

  let translatedResults = scanResults;
  // namespaceMap is populated by translateStrings; used in the rewrite step
  // to pass the correct namespace to each rewriteFile call.
  let namespaceMap = new Map<string, string>();

  if (untranslated.length > 0) {
    const aiSpinner = ora(`Calling ${effectiveConfig.aiProvider} (${effectiveConfig.aiModel})…`).start();

    const translateOpts: import("@saidksi/localizer-core").TranslateOptions = {
      overwrite: config.overwriteExisting,
    };
    if (options.dryRun !== undefined) translateOpts.dryRun = options.dryRun;
    const translateResult = await translateStrings(
      scanResults,
      effectiveConfig,
      apiKey,
      translateOpts,
    );

    aiSpinner.succeed(
      `Translated ${chalk.yellow(translateResult.uniqueStrings)} string${translateResult.uniqueStrings !== 1 ? "s" : ""} via ${translateResult.aiCalls} AI call${translateResult.aiCalls !== 1 ? "s" : ""}.`,
    );

    if (translateResult.aiCostUsd > 0) {
      logger.dim(`  Estimated cost: ~$${translateResult.aiCostUsd.toFixed(4)}`);
    }

    translatedResults = translateResult.results;
    namespaceMap      = translateResult.namespaceMap;
    pipeline.translated = translateResult.uniqueStrings;
    pipeline.aiCostUsd  = translateResult.aiCostUsd;
  } else {
    logger.dim("  Nothing to translate — all strings already have keys.");
  }

  // ── Step 3: Rewrite (optional) ────────────────────────────────────────────────
  if (!options.skipRewrite) {
    stepIdx++;
    logger.blank();
    logger.step(stepIdx, total, "Rewriting source files…");

    // Resolve keys from messages JSON for any results still missing resolvedKey
    const resolveSpinner = ora("Resolving keys…").start();
    const resolved = await resolveKeysFromMessages(translatedResults, effectiveConfig);
    const resolvable = resolved.filter((r) => r.resolvedKey !== null && !r.alreadyTranslated);
    resolveSpinner.succeed(
      `${resolvable.length} string${resolvable.length !== 1 ? "s" : ""} ready to rewrite.`,
    );

    if (resolvable.length === 0) {
      logger.dim("  Nothing to rewrite.");
    } else {
      const byFile = groupResultsByFile(resolvable);
      const fileList = [...byFile.keys()];

      if (!options.yes && !options.dryRun) {
        logger.raw(
          chalk.dim(`\n  Processing ${fileList.length} file${fileList.length !== 1 ? "s" : ""} — you will be asked to confirm each diff.\n`),
        );
      }

      let appliedCount = 0;

      // Build a collision-safe namespace map for files in this rewrite batch.
      // Prefer entries already resolved by the translate step; fill in any
      // files that were skipped (cached / already-translated) via resolveNamespaces.
      const rewriteNsMap =
        namespaceMap.size > 0
          ? new Map([
              ...resolveNamespaces(fileList),
              ...namespaceMap,              // translate step wins on overlap
            ])
          : resolveNamespaces(fileList);

      for (const [filePath, fileResults] of byFile) {
        const namespace = rewriteNsMap.get(filePath);
        const result = await processOneFile(filePath, fileResults, options, effectiveConfig, namespace);
        if (result.applied) appliedCount++;
      }

      pipeline.rewritten = appliedCount;

      if (appliedCount > 0) {
        logger.success(`${appliedCount} file${appliedCount !== 1 ? "s" : ""} rewritten.`);
      }
    }

    // Update cache with rewritten source files (after rewrite completes)
    if (!options.dryRun && translatedResults.length > 0) {
      const processed: Array<{ relPath: string; source: string; stringCount: number }> = [];
      const processedFiles = new Set(translatedResults.map((r) => r.file));

      for (const filePath of processedFiles) {
        try {
          const source  = await readFile(filePath, "utf-8");
          const relPath = relative(cwd, filePath);
          const count   = translatedResults.filter((r) => r.file === filePath).length;
          processed.push({ relPath, source, stringCount: count });
        } catch { /* skip */ }
      }

      if (processed.length > 0) {
        cache = markBatchCached(cache, processed);
        await writeCache(cwd, cache);
      }
    }
  }

  // ── Step 4: Validate (optional) ───────────────────────────────────────────────
  if (!options.skipValidate) {
    stepIdx++;
    logger.blank();
    logger.step(stepIdx, total, "Checking key coverage…");

    const validateSpinner = ora("Validating…").start();
    const page = options.file
      ? basename(options.file, extname(options.file)).toLowerCase()
      : undefined;

    const validateOpts: import("@saidksi/localizer-core").ValidateOptions = {};
    if (page !== undefined) validateOpts.page = page;
    const results = await validateCoverage(effectiveConfig, validateOpts);
    const totalMissing = results.reduce((n, r) => n + r.missingKeys.length, 0);
    const allCovered   = totalMissing === 0;

    validateSpinner.succeed(
      allCovered
        ? "All keys present across all languages."
        : `${totalMissing} missing key${totalMissing !== 1 ? "s" : ""} found.`,
    );

    pipeline.validated = allCovered;

    logger.blank();
    logger.raw(chalk.bold("  Key coverage report:\n"));
    for (const r of results) {
      console.log(progressBar(r.language, r.coveragePercent, r.totalKeys, r.missingKeys.length));
    }
    logger.blank();
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  pipeline.durationMs = Date.now() - startMs;
  const durationSec = (pipeline.durationMs / 1000).toFixed(1);

  logger.raw(chalk.bold("  Pipeline complete."));
  logger.dim(`  Duration: ${durationSec}s`);
  logger.dim(`  Scanned: ${pipeline.scanned} string${pipeline.scanned !== 1 ? "s" : ""}`);

  if (pipeline.translated > 0) {
    logger.dim(`  Translated: ${pipeline.translated} string${pipeline.translated !== 1 ? "s" : ""}`);
  }
  if (pipeline.rewritten > 0) {
    logger.dim(`  Rewritten: ${pipeline.rewritten} file${pipeline.rewritten !== 1 ? "s" : ""}`);
  }
  if (pipeline.aiCostUsd > 0) {
    logger.dim(`  Estimated AI cost: ~$${pipeline.aiCostUsd.toFixed(4)}`);
  }

  if (options.dryRun) {
    logger.blank();
    logger.warn("Dry run — no files written.");
  }

  logger.blank();

  // Exit 1 in strict mode or CI mode if validation failed
  if (!options.skipValidate && !pipeline.validated && (config.strictMode || options.ci)) {
    process.exit(1);
  }
}

export const runCommand = new Command("run")
  .description("Full pipeline: scan → translate → rewrite → validate")
  .option("--file <file>",       "Scope to a single file")
  .option("--dir <dir>",         "Scope to a directory")
  .option("--lang <langs>",      "Override target languages (comma-separated)")
  .option("--dry-run",           "Preview all changes, no writes")
  .option("--skip-rewrite",      "Translate and update JSON only, skip source rewrite")
  .option("--skip-validate",     "Skip final key coverage check")
  .option("--yes",               "Skip all confirmation prompts")
  .option("--force",             "Ignore cache, re-process all files")
  .option("--ci",                "CI mode: non-interactive, exit 1 on validation failure")
  .action(async (options: RunOptions) => {
    try {
      // CI mode implies --yes
      if (options.ci) options.yes = true;
      await runPipeline(options);
    } catch (err: unknown) {
      logger.fatal(err instanceof Error ? err.message : String(err));
    }
  });
