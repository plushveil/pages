import { defineConfig } from 'oxlint'

/**
 * Oxlint configuration
 */
export default defineConfig({
  // Core rule categories
  categories: {
    correctness: 'error', // Critical errors
    suspicious: 'error', // Likely bugs and code smells
    pedantic: 'off', // Overly strict rules
    perf: 'warn', // Performance anti-patterns
    style: 'warn', // Code style
  },

  // Enable TypeScript plugin
  plugins: ['typescript'],

  // Environment
  env: {
    es2022: true,
    node: true,
    browser: true,
  },

  // Ignore patterns
  ignorePatterns: ['node_modules', 'dist', 'lib', '*.d.ts', '*.map', '*.min.js'],

  // Rule configuration (neostandard + typescript-eslint migration)
  rules: {
    // ===== TypeScript Rules =====
    'typescript/no-explicit-any': 'warn',
    'typescript/no-unused-vars': 'error',
    'typescript/ban-ts-comment': 'warn',
    'typescript/prefer-as-const': 'error',
    'typescript/no-non-null-assertion': 'warn',
    'typescript/no-var-requires': 'error',

    // ===== Core JavaScript Rules (neostandard equivalents) =====
    // Variables
    'no-unused-vars': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-undef': 'error',

    // Comparison & Logic
    eqeqeq: 'error',
    'no-constant-condition': 'error',
    'no-compare-neg-zero': 'error',
    'no-cond-assign': 'error',
    'no-dupe-else-if': 'error',
    'no-duplicate-case': 'error',

    // Functions
    'no-func-assign': 'error',
    'no-inner-declarations': 'error',
    'func-style': 'off',

    // Objects & Arrays
    'no-dupe-keys': 'error',
    'no-sparse-arrays': 'error',
    'no-array-constructor': 'error',
    'prefer-object-spread': 'error',

    // Control Flow
    'no-unreachable': 'error',
    'no-fallthrough': 'error',
    'default-case-last': 'error',

    // Best Practices
    'no-debugger': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-with': 'error',
    'no-new-func': 'error',
    'no-new-wrappers': 'error',
    'no-constructor-return': 'error',
    'no-self-assign': 'error',
    'no-self-compare': 'error',

    // Regex
    'no-regex-spaces': 'error',
    'no-invalid-regexp': 'error',
    'no-control-regex': 'warn',
    'no-misleading-character-class': 'error',

    // Errors
    'no-ex-assign': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-negation': 'error',

    // Async
    'no-async-promise-executor': 'error',
    'no-promise-executor-return': 'error',
    'no-await-in-loop': 'off',

    // ===== Disabled Rules (too restrictive or not needed) =====
    'no-console': 'off',
    curly: 'off',
    'id-length': 'off',
    'max-statements': 'off',
    'no-continue': 'off',
    'no-ternary': 'off',
    'sort-imports': 'off',
    'sort-keys': 'off',
    'capitalized-comments': 'off',
    'no-magic-numbers': 'off',
    'no-script-url': 'off',
    'max-lines': 'off',
    'max-params': 'off',
    complexity: 'off',
  },

  // Options
  options: {
    typeAware: false,
  },
})
