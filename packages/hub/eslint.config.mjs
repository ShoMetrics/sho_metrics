import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const restrictedLegacySettingSyntax = [
  'FlatWidgetSettings',
  'PropertyInspectorSettings',
  'SingleMetricDisplaySettings',
  'SettingValue',
  'RawWidgetSettingsClassification',
  'resolveFlatWidgetSettings',
  'flattenWidgetSettings',
  'classifyRawWidgetSettings',
  'readWidgetSettings',
  'writeWidgetSettings',
  'mergeWidgetSettingsPatch',
  'updateWidgetSettingsBranch',
  'resolveWidgetSettings',
  'APPEARANCE_COLOR_CONTROL_PATHS',
  'AppearanceColorControlKey',
  'GRAPHIC_TYPE_ALIASES',
  'GRAPHIC_THEME_PRESET_NAMES',
  'colorMid',
].map(name => ({
  selector: `Identifier[name="${name}"]`,
  message: `${name} is legacy settings plumbing. Use generated stored proto settings and resolved settings instead.`,
}));

const restrictedSettingsCompatibilitySyntax = [
  {
    selector: 'Identifier[name=/^normalize.*Settings$/]',
    message: 'Do not add settings normalizers. Proto/protovalidate owns stored validation; the resolver owns defaults.',
  },
  {
    selector: 'Identifier[name=/.*(SettingsCompatibility|CompatibilitySettings).*/]',
    message: 'Do not add settings compatibility paths unless explicitly requested.',
  },
  {
    selector: 'Identifier[name=/.*legacy.*Settings.*/i]',
    message: 'Do not add legacy settings paths. Old settings compatibility is not required.',
  },
];

const restrictedMetricVisualAliasSyntax = [
  'arc-gauge',
  'linear-bar',
].map(value => ({
  selector: `Literal[value="${value}"]`,
  message: `${value} is a renderer/widget alias and must not be accepted as visual settings input.`,
}));

const restrictedConcreteActionRawSettingsSyntax = [
  {
    selector: 'MemberExpression[object.type="MemberExpression"][object.property.name="payload"][property.name="settings"]',
    message: 'Concrete actions must use resolved settings from MetricAction, not raw SDK payload settings.',
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

const restrictedRenderTimingVocabularySyntax = [
  {
    selector: 'Identifier[name=/cad[ae]nce/i]',
    message: 'Use render timer or render interval instead of cadence/cadance in TypeScript code.',
  },
  {
    selector: 'Literal[value=/cad[ae]nce/i]',
    message: 'Use render timer or render interval instead of cadence/cadance in TypeScript code.',
  },
  {
    selector: 'TemplateElement[value.raw=/cad[ae]nce/i]',
    message: 'Use render timer or render interval instead of cadence/cadance in TypeScript code.',
  },
];

const restrictedSchemaHardeningImports = {
  paths: [
    {
      name: 'zod',
      message: 'Do not add Zod beside the chosen settings proto path unless the decision is reopened.',
    },
  ],
  patterns: [
    {
      group: [
        '**/settings/model',
        '**/settings/model.js',
        '**/settings/widget-settings',
        '**/settings/widget-settings.js',
        '**/settings/defaults',
        '**/settings/defaults.js',
        '**/settings/resolver',
        '**/settings/resolver.js',
        '**/settings/codec',
        '**/settings/codec.js',
        '**/settings/updates',
        '**/settings/updates.js',
      ],
      message: 'The old hand-written settings model is deleted. Use settings/storage or settings/resolved-settings.',
    },
  ],
};

const restrictedGeneratedSettingsProtoImports = {
  patterns: [
    {
      group: ['**/generated/shometrics/v1/settings_pb', '**/generated/shometrics/v1/settings_pb.js'],
      message: 'Generated settings proto may only be imported by settings/storage modules.',
    },
  ],
};

const restrictedNonStorageSchemaHardeningImports = {
  paths: [...restrictedSchemaHardeningImports.paths],
  patterns: [
    ...restrictedSchemaHardeningImports.patterns,
    ...restrictedGeneratedSettingsProtoImports.patterns,
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
      name: './action-settings-resolver',
      message: 'Concrete actions must read/write stored settings through MetricAction ownership helpers.',
    },
    {
      name: '../settings/codec',
      message: 'Concrete actions must read/write persisted settings through MetricAction ownership helpers.',
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

const restrictedActionDisplayBuilderImports = {
  paths: [
    {
      name: './action-settings-resolver',
      message: 'Display builders must receive resolved inputs from actions instead of reading stored settings.',
    },
    {
      name: '../settings/codec',
      message: 'Display builders must not parse persisted settings.',
    },
    {
      name: '../settings/updates',
      message: 'Display builders must not write persisted settings.',
    },
    {
      name: '../settings/global-settings-store',
      message: 'Display builders must receive resolved global settings from actions.',
    },
  ],
  patterns: [...restrictedNonStorageSchemaHardeningImports.patterns],
};

const restrictedConcreteActionSettingsWriteSyntax = [
  {
    selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name="setSettings"]',
    message: 'Concrete actions must write persisted settings through MetricAction ownership helpers.',
  },
];

const restrictedRendererImportRules = {
  paths: [...restrictedNonStorageSchemaHardeningImports.paths],
  patterns: [
    ...restrictedNonStorageSchemaHardeningImports.patterns,
    ...restrictedRendererSettingsImports.patterns,
  ],
};

const restrictedConcreteActionImportRules = {
  paths: [
    ...restrictedNonStorageSchemaHardeningImports.paths,
    ...restrictedConcreteActionSettingsImports.paths,
  ],
  patterns: [...restrictedNonStorageSchemaHardeningImports.patterns],
};

const sourceSafetyRules = {
  'no-console': 'error',
  'no-eval': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
};

const typeAwareSourceSafetyRules = {
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.test-dist/**',
      '**/package-lock.json',
      'src/generated/**',
      'scripts/benchmark/protobuf/generated/**',
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
    rules: {
      'no-restricted-imports': ['error', restrictedSchemaHardeningImports],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/settings/storage/**/*'],
    rules: {
      'no-restricted-imports': ['error', restrictedNonStorageSchemaHardeningImports],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      ...sourceSafetyRules,
      ...typeAwareSourceSafetyRules,
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedSettingsCompatibilitySyntax,
        ...restrictedRenderTimingVocabularySyntax,
      ],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      ...sourceSafetyRules,
      'no-restricted-syntax': [
        'error',
        ...restrictedRenderTimingVocabularySyntax,
      ],
    },
  },
  {
    files: ['src/{rendering,widgets}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', restrictedRendererImportRules],
    },
  },
  {
    files: ['src/metric-view-runner/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', restrictedConcreteActionImportRules],
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedSettingsCompatibilitySyntax,
        ...restrictedRenderTimingVocabularySyntax,
        ...restrictedActionPayloadSettingsMutationSyntax,
        {
          selector: 'MemberExpression[object.type="MemberExpression"][object.object.name="event"][object.property.name="payload"][property.name="settings"]',
          message: 'Display code must receive resolved settings instead of reading event.payload.settings.',
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
        ...restrictedSettingsCompatibilitySyntax,
        ...restrictedRenderTimingVocabularySyntax,
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
        ...restrictedSettingsCompatibilitySyntax,
        ...restrictedRenderTimingVocabularySyntax,
        ...restrictedConcreteActionRawSettingsSyntax,
        ...restrictedActionPayloadSettingsMutationSyntax,
        ...restrictedConcreteActionVisualFallbackSyntax,
        ...restrictedConcreteActionResolvedSettingsAliasSyntax,
        ...restrictedConcreteActionColorFallbackSyntax,
        ...restrictedConcreteActionSettingsWriteSyntax,
      ],
    },
  },
  {
    files: ['src/actions/{disk,network}/view-builder.ts'],
    rules: {
      'no-restricted-imports': ['error', restrictedActionDisplayBuilderImports],
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedSettingsCompatibilitySyntax,
        ...restrictedRenderTimingVocabularySyntax,
      ],
    },
  },
  {
    files: ['src/settings/{render-appearance-builder,render-paint-resolver}*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedSettingsCompatibilitySyntax,
        ...restrictedRenderTimingVocabularySyntax,
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
