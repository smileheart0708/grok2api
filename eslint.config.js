// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".wrangler/**",
      "local/**",       // 排除整个 local 文件夹
      "**/.venv/**", 
      "**/site-packages/**" 
    ],
  },

  {
    ...js.configs.recommended,
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.es2022,
        ...globals.node,
      },
    },
  },

  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.es2022,
        ...globals.serviceworker,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'warn',
    },
  },

  {
    files: ['app/static/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.es2022,
        ...globals.browser,
        ensureApiKey: 'readonly',
        buildAuthHeaders: 'readonly',
        logout: 'readonly',
        showToast: 'readonly',
        storeAppKey: 'readonly',
        getStoredAppKey: 'readonly',
        updateStorageModeButton: 'readonly',
        Chart: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  }
);
