import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'dev-dist'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Legacy code is being migrated; tighten these step by step (see tasks/plan.md).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  { files: ['src/game/logic/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } }
);
