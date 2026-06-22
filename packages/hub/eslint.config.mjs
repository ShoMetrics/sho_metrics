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

const restrictedDirectDateNowSyntax = [
  {
    selector: 'MemberExpression[object.name="Date"][property.name="now"]',
    message: 'Do not call Date.now() directly. Use shared/clock wallClockNowMilliseconds() or monotonicNowMilliseconds() so timing intent is explicit.',
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
      group: ['**/generated/proto/shometrics/v1/settings_pb', '**/generated/proto/shometrics/v1/settings_pb.js'],
      message: 'Generated settings proto may only be imported by settings/storage modules.',
    },
  ],
};

const sourceProtoBoundaryFiles = [
  'src/runtime/sources/metric-source.ts',
  'src/runtime/sources/source-client.ts',
  'src/runtime/sources/windows-helper/windows-helper-grpc-transport.ts',
  'src/runtime/sources/windows-helper/windows-helper-source-api-mapper.ts',
  'src/runtime/sources/windows-helper/windows-helper-source-client.ts',
  'src/runtime/sources/windows-helper/windows-helper-source-client.test.ts',
];

const restrictedGeneratedHelperProtoImports = {
  patterns: [
    {
      group: [
        '**/generated/proto/shometrics/v1/helper_grpc_service_pb',
        '**/generated/proto/shometrics/v1/helper_grpc_service_pb.js',
      ],
      message: 'Generated helper gRPC proto may only be imported by runtime source boundary files.',
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

const restrictedNonStorageSchemaAndSourceProtoImports = {
  paths: [...restrictedNonStorageSchemaHardeningImports.paths],
  patterns: [
    ...restrictedNonStorageSchemaHardeningImports.patterns,
    ...restrictedGeneratedHelperProtoImports.patterns,
  ],
};

const restrictedSettingsResolverEnumMapImports = {
  paths: [
    ...restrictedSchemaHardeningImports.paths,
    {
      name: '../resolved-to-stored-enum-maps',
      message: 'Settings resolvers must use stored-to-resolved enum maps. Resolved-to-stored maps are for settings patch/write paths.',
    },
    {
      name: '../resolved-to-stored-enum-maps.js',
      message: 'Settings resolvers must use stored-to-resolved enum maps. Resolved-to-stored maps are for settings patch/write paths.',
    },
  ],
  patterns: [...restrictedSchemaHardeningImports.patterns],
};

const restrictedSettingsStorageWriteEnumMapImports = {
  paths: [
    ...restrictedSchemaHardeningImports.paths,
    {
      name: './resolver/stored-to-resolved-enum-maps',
      message: 'Settings write paths must use resolved-to-stored enum maps. Stored-to-resolved maps are for resolver read paths.',
    },
    {
      name: './resolver/stored-to-resolved-enum-maps.js',
      message: 'Settings write paths must use resolved-to-stored enum maps. Stored-to-resolved maps are for resolver read paths.',
    },
    {
      name: '../resolver/stored-to-resolved-enum-maps',
      message: 'Settings write paths must use resolved-to-stored enum maps. Stored-to-resolved maps are for resolver read paths.',
    },
    {
      name: '../resolver/stored-to-resolved-enum-maps.js',
      message: 'Settings write paths must use resolved-to-stored enum maps. Stored-to-resolved maps are for resolver read paths.',
    },
  ],
  patterns: [...restrictedSchemaHardeningImports.patterns],
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
  patterns: [...restrictedNonStorageSchemaAndSourceProtoImports.patterns],
};

const restrictedConcreteActionSettingsWriteSyntax = [
  {
    selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name="setSettings"]',
    message: 'Concrete actions must write persisted settings through MetricAction ownership helpers.',
  },
];

const restrictedRendererImportRules = {
  paths: [...restrictedNonStorageSchemaAndSourceProtoImports.paths],
  patterns: [
    ...restrictedNonStorageSchemaAndSourceProtoImports.patterns,
    ...restrictedRendererSettingsImports.patterns,
  ],
};

const restrictedConcreteActionImportRules = {
  paths: [
    ...restrictedNonStorageSchemaAndSourceProtoImports.paths,
    ...restrictedConcreteActionSettingsImports.paths,
  ],
  patterns: [...restrictedNonStorageSchemaAndSourceProtoImports.patterns],
};

const restrictedRuntimeSourceClientImports = {
  patterns: [
    {
      group: [
        '../source-routing/*',
        '../../source-routing/*',
        '../../../source-routing/*',
      ],
      message: 'Runtime source clients must not import source-routing policy. Routing decides desired source order before sources read data.',
    },
  ],
};

const restrictedRuntimeSourceRoutingImports = {
  patterns: [
    {
      group: [
        '../metric-collection/*',
        '../../metric-collection/*',
        '../../../metric-collection/*',
      ],
      message: 'Source routing must not import metric collection. Routing builds read plans; collection owns polling and freshness.',
    },
    {
      group: [
        '../sources/node-system/*',
        '../sources/windows-helper/*',
        '../../sources/node-system/*',
        '../../sources/windows-helper/*',
      ],
      message: 'Source routing may import source IDs/contracts, not concrete source implementations.',
    },
  ],
};

const restrictedRuntimeMetricCollectionImports = {
  patterns: [
    {
      group: [
        '../sources/node-system/*',
        '../sources/windows-helper/*',
        '../../sources/node-system/*',
        '../../sources/windows-helper/*',
      ],
      message: 'Metric collection must depend on source contracts, not concrete source implementations.',
    },
  ],
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
    ignores: ['src/settings/storage/**/*', ...sourceProtoBoundaryFiles],
    rules: {
      'no-restricted-imports': ['error', restrictedNonStorageSchemaAndSourceProtoImports],
    },
  },
  {
    files: ['src/settings/storage/resolver/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', restrictedSettingsResolverEnumMapImports],
    },
  },
  {
    files: ['src/settings/storage/**/*.{ts,tsx}'],
    ignores: ['src/settings/storage/resolver/**/*', 'src/settings/storage/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', restrictedSettingsStorageWriteEnumMapImports],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts', 'src/shared/clock.ts'],
    rules: {
      ...sourceSafetyRules,
      ...typeAwareSourceSafetyRules,
      'no-restricted-syntax': [
        'error',
        ...restrictedLegacySettingSyntax,
        ...restrictedSettingsCompatibilitySyntax,
        ...restrictedRenderTimingVocabularySyntax,
        ...restrictedDirectDateNowSyntax,
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
    files: ['src/runtime/sources/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [...restrictedNonStorageSchemaHardeningImports.paths],
        patterns: [
          ...restrictedNonStorageSchemaHardeningImports.patterns,
          ...restrictedRuntimeSourceClientImports.patterns,
        ],
      }],
    },
  },
  {
    files: ['src/runtime/sources/**/*.{ts,tsx}'],
    ignores: sourceProtoBoundaryFiles,
    rules: {
      'no-restricted-imports': ['error', {
        paths: [...restrictedNonStorageSchemaAndSourceProtoImports.paths],
        patterns: [
          ...restrictedNonStorageSchemaAndSourceProtoImports.patterns,
          ...restrictedRuntimeSourceClientImports.patterns,
        ],
      }],
    },
  },
  {
    files: ['src/runtime/source-routing/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [...restrictedNonStorageSchemaAndSourceProtoImports.paths],
        patterns: [
          ...restrictedNonStorageSchemaAndSourceProtoImports.patterns,
          ...restrictedRuntimeSourceRoutingImports.patterns,
        ],
      }],
    },
  },
  {
    files: ['src/runtime/metric-collection/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [...restrictedNonStorageSchemaAndSourceProtoImports.paths],
        patterns: [
          ...restrictedNonStorageSchemaAndSourceProtoImports.patterns,
          ...restrictedRuntimeMetricCollectionImports.patterns,
        ],
      }],
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
