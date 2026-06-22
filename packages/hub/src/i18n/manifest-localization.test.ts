import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildStreamDeckLocaleJson,
    validateManifestLocalizationCatalog,
    type ManifestMessagesCatalog,
} from "./manifest-localization";

test("builds Stream Deck locale JSON from manifest catalog", () => {
    const manifest = buildManifestFixture();
    const catalog = buildCatalogFixture();

    assert.deepEqual(buildStreamDeckLocaleJson(manifest, catalog, "zh_CN"), {
        Name: "应用",
        Description: "描述",
        "com.example.action": {
            Name: "动作",
            Tooltip: "提示",
            States: [
                {
                    Name: "状态",
                },
            ],
            Encoder: {
                TriggerDescription: {
                    Push: "按下",
                },
            },
        },
    });
});

test("validates manifest English text and catalog action coverage", () => {
    assert.deepEqual(validateManifestLocalizationCatalog(buildManifestFixture(), buildCatalogFixture()), []);

    assert.deepEqual(validateManifestLocalizationCatalog({
        ...buildManifestFixture(),
        Actions: [
            {
                UUID: "com.example.action",
                Name: "Wrong",
                Tooltip: "Tooltip",
            },
            {
                UUID: "com.example.extra",
                Name: "Extra",
                Tooltip: "Extra",
            },
        ],
    }, buildCatalogFixture()), [
        "com.example.action Name English text differs: manifest=\"Wrong\" catalog=\"Action\"",
        "com.example.action States length differs from manifest catalog",
        "com.example.action Encoder.TriggerDescription.Push English text differs: manifest=undefined catalog=\"Push\"",
        "Manifest action is missing from manifest catalog: com.example.extra",
    ]);
});

test("requires manifest state and encoder text to be covered by the catalog", () => {
    const catalog = {
        ...buildCatalogFixture(),
        actions: {
            "com.example.action": {
                name: {
                    en: "Action",
                    zh_CN: "动作",
                    ja: "アクション",
                },
                tooltip: {
                    en: "Tooltip",
                    zh_CN: "提示",
                    ja: "ツールチップ",
                },
            },
        },
    } satisfies ManifestMessagesCatalog;

    assert.deepEqual(validateManifestLocalizationCatalog(buildManifestFixture(), catalog), [
        "com.example.action States contains localizable Name values missing from manifest catalog",
        "com.example.action Encoder.TriggerDescription is missing from manifest catalog",
    ]);

    assert.deepEqual(validateManifestLocalizationCatalog(buildManifestFixture(), {
        ...catalog,
        actions: {
            "com.example.action": {
                ...catalog.actions["com.example.action"],
                encoder: {
                    triggerDescription: {},
                },
            },
        },
    }), [
        "com.example.action States contains localizable Name values missing from manifest catalog",
        "com.example.action Encoder.TriggerDescription.Push is missing from manifest catalog",
    ]);
});

function buildManifestFixture() {
    return {
        Name: "App",
        Description: "Description",
        Actions: [
            {
                UUID: "com.example.action",
                Name: "Action",
                Tooltip: "Tooltip",
                States: [
                    {
                        Name: "State",
                    },
                ],
                Encoder: {
                    TriggerDescription: {
                        Push: "Push",
                    },
                },
            },
        ],
    };
}

function buildCatalogFixture(): ManifestMessagesCatalog {
    return {
        root: {
            name: {
                en: "App",
                zh_CN: "应用",
                ja: "アプリ",
            },
            description: {
                en: "Description",
                zh_CN: "描述",
                ja: "説明",
            },
        },
        actions: {
            "com.example.action": {
                name: {
                    en: "Action",
                    zh_CN: "动作",
                    ja: "アクション",
                },
                tooltip: {
                    en: "Tooltip",
                    zh_CN: "提示",
                    ja: "ツールチップ",
                },
                states: [
                    {
                        name: {
                            en: "State",
                            zh_CN: "状态",
                            ja: "状態",
                        },
                    },
                ],
                encoder: {
                    triggerDescription: {
                        Push: {
                            en: "Push",
                            zh_CN: "按下",
                            ja: "押す",
                        },
                    },
                },
            },
        },
    };
}
