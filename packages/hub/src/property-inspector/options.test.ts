import assert from "node:assert/strict";
import test from "node:test";
import { basePropertyInspectorSettings } from "./settings";
import type { VisibilityContext } from "./schema";
import {
    resolveDiskAutoLinearLabel,
    resolveFieldOptions,
    resolveSelectedDiskVolumeLabel,
} from "./options";

test("network interface options include automatic and formatted valid interfaces only", () => {
    const context = buildContext({
        availableNetworkInterfaces: JSON.stringify([
            {
                id: "eth0",
                name: "Ethernet",
                type: "wired",
                isDefault: true,
                speedMegabitsPerSecond: 2500,
            },
            {
                id: "broken",
                name: "Missing type",
            },
        ]),
    });

    assert.deepEqual(resolveFieldOptions("networkInterfaces", context), [
        { value: "", label: "Automatic" },
        { value: "eth0", label: "Ethernet (default, wired, eth0, 2500 Mbps)" },
    ]);
});

test("disk volume options include automatic and compact capacity labels", () => {
    const context = buildContext({
        availableDiskVolumes: JSON.stringify([
            buildDiskVolume({
                id: "C:\\",
                mount: "C:\\",
                volumeLabel: "System",
                sizeBytes: 1024 ** 3,
            }),
            {
                id: "broken",
                fs: "D:",
            },
        ]),
    });

    assert.deepEqual(resolveFieldOptions("diskVolumes", context), [
        { value: "", label: "Automatic" },
        { value: "C:\\", label: "C: (1.0 GB, System)" },
    ]);
});

test("invalid serialized option payloads safely fall back to automatic only", () => {
    const context = buildContext({
        availableNetworkInterfaces: "{",
        availableDiskVolumes: "{}",
    });

    assert.deepEqual(resolveFieldOptions("networkInterfaces", context), [{ value: "", label: "Automatic" }]);
    assert.deepEqual(resolveFieldOptions("diskVolumes", context), [{ value: "", label: "Automatic" }]);
});

test("selected disk labels prefer explicit selection then root fallback", () => {
    const context = buildContext({
        diskVolumeId: "D:\\Games",
        availableDiskVolumes: JSON.stringify([
            buildDiskVolume({ id: "C:\\", mount: "C:\\", volumeLabel: "System", storageKind: "ssd" }),
            buildDiskVolume({ id: "D:\\Games", mount: "D:\\Games", volumeLabel: "Games", storageKind: "hdd" }),
        ]),
    });
    const automaticContext = buildContext({
        availableDiskVolumes: context.settings.availableDiskVolumes,
    });

    assert.equal(resolveSelectedDiskVolumeLabel(context), "Games");
    assert.equal(resolveDiskAutoLinearLabel(context), "Auto: HDD (GAME)");
    assert.equal(resolveDiskAutoLinearLabel(automaticContext), "Auto: SSD (C:)");
});

test("selected disk label returns dash when no valid disk is available", () => {
    assert.equal(resolveSelectedDiskVolumeLabel(buildContext()), "-");
    assert.equal(resolveDiskAutoLinearLabel(buildContext()), "Auto");
});

function buildContext(settings: Partial<typeof basePropertyInspectorSettings> = {}): VisibilityContext {
    return {
        actionKind: "disk",
        isWindows: false,
        settings: {
            ...basePropertyInspectorSettings,
            ...settings,
        },
    };
}

function buildDiskVolume(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "/",
        fs: "/dev/disk1",
        mount: "/",
        storageKind: "ssd",
        diskName: "Example Disk",
        volumeLabel: "",
        sizeBytes: 500 * 1024 ** 3,
        ...overrides,
    };
}
