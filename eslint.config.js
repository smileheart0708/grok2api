// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
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

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    // 这里的配置只针对你真正关心的文件
    files: ["src/**/*.ts"], 
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { "assertionStyle": "never" }
      ],
      "@typescript-eslint/no-unused-vars": "error",
      "no-console": "warn",
    },
  }
);
