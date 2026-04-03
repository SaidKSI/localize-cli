# @localize/cli

Command-line tool for automating i18n workflows in JavaScript/TypeScript projects. Scans for hardcoded strings, generates semantic i18n keys via AI, translates into target languages, and rewrites source code.

## Installation

```bash
# Global installation
npm install -g @localize/cli

# Per-project installation
npm install --save-dev @localize/cli
```

## Quick Start

```bash
# Initialize your project
localize init

# Scan for hardcoded strings
localize scan src/

# Full automation: scan → generate keys → translate → rewrite
localize run --yes

# Validate translation coverage
localize validate
```

## Commands

### `localize init`
Interactive setup wizard. Creates `.localize.config.json` and stores API keys in `~/.localize`.

### `localize audit`
Count total untranslated strings in your project.

### `localize scan <path>`
List all hardcoded strings found in a file or directory.

### `localize translate [options]`
Generate semantic i18n keys and translate strings into target languages.

### `localize rewrite <path> [options]`
Replace hardcoded strings with i18n function calls (`t('key')`).

### `localize run [options]`
Full pipeline: scan → generate keys → translate → rewrite → validate.

### `localize validate [options]`
Check translation coverage across all languages. Use `--ci` for CI/CD.

### `localize add-lang <language>`
Add a new language and translate all existing keys.

### `localize status`
Show project health snapshot (files, strings, translation coverage).

### `localize diff <language>`
Show missing keys for a specific language.

## Configuration

Create `.localize.config.json` in your project root:

```json
{
  "defaultLanguage": "en",
  "languages": ["en", "fr", "es"],
  "messagesDir": "./messages",
  "include": ["src/**/*.{ts,tsx,js,jsx}"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"],
  "aiProvider": "anthropic",
  "aiModel": "claude-3-sonnet-20240229",
  "keyStyle": "dot.notation",
  "i18nLibrary": "react-i18next",
  "fileOrganization": "per-page",
  "strictMode": true,
  "glossary": {}
}
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## License

MIT

## Repository

https://github.com/SaidKSI/localize-cli
