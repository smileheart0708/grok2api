// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 这里的 rules 就是你之前的“安检规则”
    rules: {
      "@typescript-eslint/no-explicit-any": "error",          // 严禁 any
      "@typescript-eslint/consistent-type-assertions": [      // 严禁 as
        "error",
        { "assertionStyle": "never" }
      ],
      "@typescript-eslint/no-unused-vars": "error",           // 禁止未使用的变量
      "no-console": "warn",                                   // console 警告
    },
  },
  {
    // 告诉 ESLint 哪些文件不需要检查（比如构建产物）
    ignores: ["dist/**", "node_modules/**", ".wrangler/**"],
  }
);
