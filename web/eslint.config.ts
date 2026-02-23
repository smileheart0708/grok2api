import { globalIgnores } from 'eslint/config'
import {
  configureVueProject,
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

configureVueProject({
  rootDir: import.meta.dirname,
  scriptLangs: ['ts'],
  allowComponentTypeUnsafety: false,
})

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.strictTypeChecked,
  vueTsConfigs.stylisticTypeChecked,

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  {
    name: 'app/custom-rules',
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },

  skipFormatting,
)
