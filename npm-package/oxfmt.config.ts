import { defineConfig } from 'oxfmt'

/**
 * Oxfmt configuration Standard/neostandard style formatting
 */
export default defineConfig({
  // ===== Standard Style Rules =====
  // No semicolons (standard style)
  semi: false,

  // Single quotes instead of double quotes
  singleQuote: true,

  // Single quotes in JSX too
  jsxSingleQuote: true,

  // Trailing commas for cleaner diffs
  trailingComma: 'all',

  // ===== Code Style =====
  // Line width
  printWidth: 220,

  // 2-space indentation (standard)
  tabWidth: 2,
  useTabs: false,

  // Arrow function parentheses
  arrowParens: 'always',

  // Bracket spacing in objects: { foo: bar }
  bracketSpacing: true,

  // Quote object properties only when needed
  quoteProps: 'as-needed',

  // ===== End of Line =====
  endOfLine: 'lf',
  insertFinalNewline: true,

  // ===== JSDoc Formatting =====
  jsdoc: {
    enabled: true,
    commentLineStrategy: 'multiline',
    lineWrappingStyle: 'balance',
  },

  // ===== Import Sorting =====
  sortImports: true,

  // ===== Ignore Patterns =====
  ignorePatterns: ['node_modules', 'dist', 'lib', '*.min.js', 'package-lock.json'],

  // ===== File-specific Overrides =====
  overrides: [
    {
      files: ['**/*.html'],
      options: {
        printWidth: 320,
      },
    },
  ],
})
