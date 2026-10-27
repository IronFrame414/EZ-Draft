// EZD-001 · one flat ESLint config for the workspace (vault/plans/EZD-001.md Step 3).
// Ignores every folder the tools must never scan (PROCESS-EZDRAFT.md section 5; PROCESS.md section 14).
// All TS/JS: @eslint/js recommended + typescript-eslint recommended (not type-checked).
// app/** only: the flat configs of eslint-config-next (core-web-vitals, typescript); packages/geometry gets no Next or React config.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import ezdraft from './eslint-rules/index.mjs';
import { pinnedReactVersion } from './eslint-rules/react-version.mjs';
import {
  EDITOR_CODE,
  EDITOR_CODE_IMPORTERS,
  HEAVY_PACKAGES,
  LAZY_ROOT,
  PATH_ALIASES,
} from './eslint-rules/boundaries.mjs';

const APP = ['app/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];
// Absolute so the Next plugin finds app/ whether ESLint runs from the root (T7, T8) or from app/ (the app lint script).
const APP_DIR = path.join(import.meta.dirname, 'app');
const NO_POLLING =
  'No polling (11 Performance rule 11; EZD-018). Push over Realtime. A display-only timer needs an eslint-disable comment with the reason.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'app/next-env.d.ts',
      '.claude/**',
      'vault/**',
      'spikes/**',
      'app/src/server/db/database.types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...[...nextCoreWebVitals, ...nextTypescript].map((cfg) => ({ ...cfg, files: APP })),
  {
    files: APP,
    settings: {
      next: { rootDir: APP_DIR },
      // EZD-186 (Q-0324): an exact react version, not 'detect', so a root lint never warns about react.
      react: { version: pinnedReactVersion(APP_DIR) },
    },
  },
  // EZD-026a · phone screens never carry literal interface text (vault/plans/EZD-026a.md Step 4; R26 R17). EZD-015a adds the states folder.
  {
    files: [
      'app/src/app/(field)/**/*.{tsx,jsx}',
      'app/src/components/field/**/*.{tsx,jsx}',
      'app/src/components/phone/**/*.{tsx,jsx}',
      'app/src/components/states/**/*.{tsx,jsx}',
      'app/src/components/disclaimer/**/*.{tsx,jsx}',
    ],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    plugins: { ezdraft },
    rules: {
      'ezdraft/no-literal-ui-string': [
        'error',
        { allowedKeyPrefixes: ['common.', 'field.', 'error.'] },
      ],
    },
  },
  {
    files: ['app/src/app/(client)/**/*.{tsx,jsx}', 'app/src/components/client/**/*.{tsx,jsx}'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    plugins: { ezdraft },
    rules: {
      'ezdraft/no-literal-ui-string': [
        'error',
        { allowedKeyPrefixes: ['common.', 'client.', 'error.'] },
      ],
    },
  },
  {
    files: ['app/src/app/dev/messages/**/*.{tsx,jsx}'],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    plugins: { ezdraft },
    rules: {
      'ezdraft/no-literal-ui-string': [
        'error',
        { allowedKeyPrefixes: ['common.', 'field.', 'error.', 'dev.'] },
      ],
    },
  },
  // EZD-007e: the sign-in pages have a Spanish mode, so a literal would show English to a Spanish user (R26 R17; R24 #40).
  {
    files: [
      'app/src/app/sign-in/**/*.{tsx,jsx}',
      'app/src/app/auth/confirm/**/*.{tsx,jsx}',
      'app/src/components/auth/**/*.{tsx,jsx}',
      'app/src/app/terms/**/*.{tsx,jsx}',
    ],
    ignores: ['**/*.test.*', '**/*.spec.*'],
    plugins: { ezdraft },
    rules: {
      'ezdraft/no-literal-ui-string': ['error', { allowedKeyPrefixes: ['common.', 'error.'] }],
    },
  },
  // EZD-018 Step 7 · no polling loops anywhere in the app (11 Performance rule 11). A later block that sets
  // no-restricted-globals or no-restricted-properties for these files must repeat these entries.
  {
    files: ['app/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*', '**/*.spec.*', '**/test-utils/**', '**/test-harness/**'],
    rules: {
      'no-restricted-globals': ['error', { name: 'setInterval', message: NO_POLLING }],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'setInterval', message: NO_POLLING },
        { object: 'globalThis', property: 'setInterval', message: NO_POLLING },
        { object: 'self', property: 'setInterval', message: NO_POLLING },
      ],
    },
  },
  // EZD-020 Step 4 · heavy libraries only in their lazy places, lazy modules only by import(), editor code only in
  // the editor (11 Performance rule 7). Paths are relative to this file's folder, whatever the cwd.
  {
    files: ['app/src/**/*.{ts,tsx,js,jsx,mjs,cjs}', 'packages/*/src/**/*.{ts,tsx,js,mjs}'],
    ignores: ['**/*.test.*', '**/*.spec.*', '**/test-utils/**', '**/test-harness/**', '**/e2e/**'],
    plugins: { ezdraft },
    rules: {
      'ezdraft/import-boundaries': [
        'error',
        {
          rootDir: path.dirname(fileURLToPath(import.meta.url)),
          packages: HEAVY_PACKAGES,
          lazyRoot: LAZY_ROOT,
          editorCode: EDITOR_CODE,
          editorCodeImporters: EDITOR_CODE_IMPORTERS,
          aliases: PATH_ALIASES,
        },
      ],
    },
  },
);
