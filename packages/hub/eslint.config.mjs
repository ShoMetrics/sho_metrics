import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const restrictedLegacySettingSyntax = [
  'FlatWidgetSettings',
  'PropertyInspectorSettings',
  'SingleMetricDisplaySettings',
  'SettingValue',
  'resolveFlatWidgetSettings',
  'flattenWidgetSettings',
  'APPEARANCE_COLOR_CONTROL_PATHS',
  'AppearanceColorControlKey',
  'GRAPHIC_TYPE_ALIASES',
  'GRAPHIC_THEME_PRESET_NAMES',
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

const restrictedConcreteActionRawSettingsSyntax = [
  {
    selector: 'MemberExpression[object.type="MemberExpression"][object.property.name="payload"][property.name="settings"]',
    message: 'Concrete actions must read stored settings through action-settings-resolver helpers.',
  },
];

const restrictedActionPayloadSettingsMutationSyntax = [
  {
    selector: 'AssignmentExpression[left.type="MemberExpression"][left.object.type="MemberExpression"][left.object.property.name="payload"][left.property.name="settings"]',
    message: 'Actions must keep latest raw settings in explicit action state instead of mutating SDK event payloads.',
  },
];

const restrictedConcreteActionVisualFallbackSyntax = [
  'normalizeThreshold',
  'resolveHexColor',
].map(name => ({
  selector: `Identifier[name="${name}"]`,
  message: `${name} is action-level visual settings fallback. Actions must trust resolved settings and renderer adapters.`,
}));

const restrictedConcreteActionResolvedSettingsAliasSyntax = [
  {
    selector: 'TSTypeAliasDeclaration[typeAnnotation.typeName.name="ResolvedWidgetSettings"]',
    message: 'Do not create no-op action settings aliases. Use ResolvedWidgetSettings directly unless the type actually narrows fields.',
  },
];

const restrictedConcreteActionColorFallbackSyntax = [
  {
    selector: 'Property[key.name="solidColor"][value.type="LogicalExpression"][value.operator="||"]',
    message: 'Actions must trust resolved colors. Put missing-value defaults in settings defaults/resolver, not concrete action fallbacks.',
  },
];

const restrictedSchemaHardeningImports = {
  paths: [
    {
      name: 'zod',
      message: 'Do not introduce Zod before the pre-proto settings cleanup is complete.',
    },
  ],
  patterns: [
    {
      group: ['**/generated/settings*'],
      message: 'Generated settings contracts are not allowed before the codec boundary is ready.',
    },
  ],
};

const restrictedRendererSettingsImports = {
  patterns: [
    {
      group: ['../settings/*', '../../settings/*', '../../../settings/*', '**/settings/*'],
      message: 'Rendering and widget primitives must receive renderer contracts, not persisted settings models.',
    },
  ],
};

const restrictedConcreteActionSettingsImports = {
  paths: [
    {
      name: '../settings/codec',
      message: 'Concrete actions must read and write settings through action-settings-resolver helpers.',
    },
    {
      name: '../settings/resolver',
      importNames: ['resolveWidgetSettings'],
      message: 'Concrete actions must receive resolved settings from action-settings-resolver helpers.',
    },
    {
      name: '../settings/widget-settings',
      importNames: ['normalizeWidgetStoredSettings'],
      message: 'Concrete actions must not normalize raw SDK settings directly.',
    },
  ],
};

const restrictedRendererImportRules = {
  paths: [...restrictedSchemaHardeningImports.paths],
  patterns: [
    ...restrictedSchemaHardeningImports.patterns,
    ...restrictedRendererSettingsImports.patterns,
  ],
};

const restrictedConcreteActionImportRules = {
  paths: [
    ...restrictedSchemaHardeningImports.paths,
    ...restrictedConcreteActionSettingsImports.paths,
  ],
  patterns: [...restrictedSchemaHardeningImports.patterns],
};

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
      'no-restricted-imports': ['error', restrictedSchemaHardeningImports],
      'no-restricted-syntax': ['error', ...restrictedLegacySettingSyntax],
    },
  },
  {
    files: ['src/{rendering,widgets}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', restrictedRendererImportRules],
    },
  },
  {
    files: ['src/actions/single-metric-display*.ts'],
    rules: {
      'no-restricted-imports': ['error', restrictedConcreteActionImportRules],
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedActionPayloadSettingsMutationSyntax,
        {
          selector: 'MemberExpression[object.type="MemberExpression"][object.object.name="event"][object.property.name="payload"][property.name="settings"]',
          message: 'Display code must receive normalized resolvedSettings instead of reading event.payload.settings.',
        },
      ],
    },
  },
  {
    files: ['src/actions/metric-action.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedActionPayloadSettingsMutationSyntax,
      ],
    },
  },
  {
    files: ['src/actions/{cpu-usage,disk,gpu-usage,net-speed,ram-usage}.ts'],
    rules: {
      'no-restricted-imports': ['error', restrictedConcreteActionImportRules],
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedConcreteActionRawSettingsSyntax,
        ...restrictedActionPayloadSettingsMutationSyntax,
        ...restrictedConcreteActionVisualFallbackSyntax,
        ...restrictedConcreteActionResolvedSettingsAliasSyntax,
        ...restrictedConcreteActionColorFallbackSyntax,
      ],
    },
  },
  {
    files: ['src/settings/visual-adapter*.ts'],
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
