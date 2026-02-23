/** @type {import('stylelint').Config} */
const config = {
  extends: ['stylelint-config-standard'],
  ignoreFiles: [
    'dist/**',
    'node_modules/**',
    'src/styles/legacy-utilities.css',
    'src/styles/ui/toast.css',
    'src/styles/pages/*.css',
  ],
  overrides: [
    {
      files: ['**/*.vue', '**/*.html'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    'selector-class-pattern': [
      '^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:__(?:[a-z0-9]+(?:-[a-z0-9]+)*))?(?:--(?:[a-z0-9]+(?:-[a-z0-9]+)*))?$',
      {
        resolveNestedSelectors: true,
        message: 'CSS 类名必须使用 BEM：block__element--modifier（kebab-case）',
      },
    ],
  },
}

export default config
