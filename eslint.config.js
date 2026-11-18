import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const refineBan = {
  patterns: [
    { group: ['@refinedev/*'], message: 'Refine is used only inside @rbp/core. Use the core facade (useListTable, useRecordForm, useIdentity, ...).' },
  ],
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/*/supabase/migrations/**', 'apps/*/supabase/functions/**', 'modules/*/functions/**', 'scripts/local/**', 'platform/packages/core/sw/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', refineBan] } },
  { files: ['**/*.{ts,tsx}'], plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } },
  // Code taken over 1:1 from the source apps keeps its loose typing (Supabase rows, jsonb metadata); new code should avoid any.
  { files: ['modules/**/*.{ts,tsx}', 'platform/packages/**/*.{ts,tsx}'], rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-expressions': 'off',
    // NPM convention: a leading underscore marks a deliberately unused binding (destructuring to drop a field).
    '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrors: 'none' }],
    // NPM puts non-breaking spaces into template strings on purpose ("12,000\u00a0DWT" never wraps).
    'no-irregular-whitespace': ['error', { skipTemplates: true, skipJSXText: true }] } },
  { files: ['scripts/**', 'tools/**', '**/*.mjs'], languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly', Buffer: 'readonly' } } },
  // The browser test tools and the Pages Function use the web APIs of Node 24 / Workers.
  { files: ['tools/browser/**', 'functions/**'], languageOptions: { globals: { setTimeout: 'readonly', Request: 'readonly', Response: 'readonly', Headers: 'readonly', WebSocket: 'readonly' } } },
  // the one place where Refine may be imported
  { files: ['platform/packages/core/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': 'off' } },
);
