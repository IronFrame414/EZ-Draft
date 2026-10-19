// EZD-001 · one flat ESLint config for the workspace (vault/plans/EZD-001.md Step 3).
// Ignores every folder the tools must never scan (PROCESS-EZDRAFT.md section 5; PROCESS.md section 14).
// All TS/JS: @eslint/js recommended + typescript-eslint recommended (not type-checked).
// app/** only: the flat configs of eslint-config-next (core-web-vitals, typescript); packages/geometry gets no Next or React config.
import path from 'node:path';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import ezdraft from './eslint-rules/index.mjs';

const APP = ['app/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];
// Absolute so the Next plugin finds app/ whether ESLint runs from the root (T7, T8) or from app/ (the app lint script).
const APP_DIR = path.join(import.meta.dirname, 'app');

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
    settings: { next: { rootDir: APP_DIR } },
  },
  // EZD-026a · phone screens never carry literal interface text (vault/plans/EZD-026a.md Step 4; R26 R17).
  {
    files: [
      'app/src/app/(field)/**/*.{tsx,jsx}',
      'app/src/components/field/**/*.{tsx,jsx}',
      'app/src/components/phone/**/*.{tsx,jsx}',
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
);
