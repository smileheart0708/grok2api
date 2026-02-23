import path from 'node:path'
import { globalIgnores } from 'eslint/config'
import {
  configureVueProject,
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

const WEB_ROOT = import.meta.dirname
const OXLINT_CONFIG_PATH = path.join(WEB_ROOT, '.oxlintrc.json')

configureVueProject({
  rootDir: WEB_ROOT,
  scriptLangs: ['ts'],
  allowComponentTypeUnsafety: false,
})

const baseConfigs = defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.strictTypeChecked,
  vueTsConfigs.stylisticTypeChecked,

  ...pluginOxlint.buildFromOxlintConfigFile(OXLINT_CONFIG_PATH),

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

const withTsconfigRootDir = (configs) =>
  configs.map((config) => {
    if (!config.languageOptions?.parserOptions) return config

    return {
      ...config,
      languageOptions: {
        ...config.languageOptions,
        parserOptions: {
          ...config.languageOptions.parserOptions,
          tsconfigRootDir: WEB_ROOT,
        },
      },
    }
  })

export default withTsconfigRootDir(baseConfigs)
