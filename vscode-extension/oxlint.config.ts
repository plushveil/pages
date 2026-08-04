module.exports = {
  categories: {
    correctness: 'error',
    pedantic: 'off',
    perf: 'warn',
    style: 'off',
    suspicious: 'error',
  },
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: ['node_modules', 'dist', '.vscode-test', '*.d.ts', '*.map'],
  options: {
    typeAware: false,
  },
  plugins: ['typescript'],
  rules: {
    'no-shadow': 'off',
    'no-unused-vars': 'warn',
    'typescript/no-unused-vars': 'warn',
  },
}
