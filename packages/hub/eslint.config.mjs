import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const restrictedLegacySettingSyntax = [
  'FlatWidgetSettings',
  'resolveFlatWidgetSettings',
  'flattenWidgetSettings',
  'colorMid',
].map(name => ({
  selector: `Identifier[name="${name}"]`,
  message: `${name} is legacy settings plumbing. Use normalized widget settings instead.`,
}));

const restrictedMetricVisualAliasSyntax = [
  'arc-gauge',
  'linear-bar',
  'sparkline',
].map(value => ({
  selector: `Literal[value="${value}"]`,
  message: `${value} is a renderer/widget alias and must not be accepted as visual settings input.`,
}));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.test-dist/**',
      '**/package-lock.json',
      'src/generated/**',
      '**/*.sdPlugin/**', // Exclude the Stream Deck plugin output folder
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedLegacySettingSyntax],
    },
  },
  {
    files: ['src/actions/single-metric-display*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        {
          selector: 'MemberExpression[object.type="MemberExpression"][object.object.name="event"][object.property.name="payload"][property.name="settings"]',
          message: 'Display code must receive normalized resolvedSettings instead of reading event.payload.settings.',
        },
      ],
    },
  },
  {
    files: ['src/actions/metric-visual-settings.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedMetricVisualAliasSyntax,
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        project: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
