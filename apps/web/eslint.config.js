import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // dist y .verify son artefactos de build/verificación.
  globalIgnores(['dist/**', '.verify/**', 'coverage/**', 'node_modules/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // El Markdown del mentor solo se inyecta con v-html tras pasar por DOMPurify
      // (ver src/components/mentor/). Cualquier otro uso debe justificarse.
      'vue/no-v-html': 'warn',
    },
  },
  {
    // Configuración y herramientas que corren en Node.
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Componentes de shadcn-vue: los nombres de una palabra (Button, Card...) son su convención.
    files: ['src/components/ui/**/*.{ts,vue}'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  // Al final: desactiva las reglas de estilo que chocan con Prettier.
  prettier,
]);
