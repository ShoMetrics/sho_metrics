import { create } from "@bufbuild/protobuf";
import {
    MetricIconSettingsSchema,
    SystemPeripheralIdentity_BluetoothIdentity_Identifier_Kind as StoredBluetoothIdentifierKind,
    SystemPeripheralIdentity_BluetoothIdentity_IdentifierSchema,
    SystemPeripheralIdentity_BluetoothIdentitySchema,
    SystemPeripheralIdentity_VendorHidIdentitySchema,
    SystemPeripheralIdentitySchema,
    type SystemBatteryMetricTarget as StoredSystemBatteryMetricTarget,
    type SystemPeripheralIdentity as StoredSystemPeripheralIdentity,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import type {
    ResolvedSystemBluetoothPeripheralIdentifier,
    ResolvedSystemPeripheralIdentity,
    ResolvedSystemVendorHidPeripheralIdentity,
} from "../../resolved-settings";
import {
    storedSystemPeripheralBindingTransportByResolved,
    storedSystemPeripheralReceiverKindByResolved,
} from "../resolved-to-stored-enum-maps";
import type { StoredWidgetSettingsPatch } from "./widget-settings-patch-types";

export function applySystemPatch(
    target: StoredSystemBatteryMetricTarget,
    patch: NonNullable<StoredWidgetSettingsPatch["system"]>,
): void {
    if ("peripheralIdentity" in patch) {
        target.peripheralIdentity = patch.peripheralIdentity === undefined
            ? undefined
            : buildStoredSystemPeripheralIdentity(patch.peripheralIdentity);
    }

    if ("detectedPeripheralDisplayName" in patch) {
        target.detectedPeripheralDisplayName = patch.detectedPeripheralDisplayName;
    }

    if ("customLabel" in patch) {
        target.customLabel = patch.customLabel;
    }

    if ("customIconId" in patch) {
        target.customIcon = patch.customIconId === undefined
            ? undefined
            : create(MetricIconSettingsSchema, { id: patch.customIconId });
    }
}

export function buildStoredSystemPeripheralIdentity(
    identity: ResolvedSystemPeripheralIdentity,
): StoredSystemPeripheralIdentity {
    return create(SystemPeripheralIdentitySchema, {
        evidence: buildStoredSystemPeripheralIdentityEvidence(identity),
    });
}

function buildStoredSystemPeripheralIdentityEvidence(
    identity: ResolvedSystemPeripheralIdentity,
): StoredSystemPeripheralIdentity["evidence"] {
    switch (identity.evidence.kind) {
        case "vendorHid":
            return {
                case: "vendorHidIdentity",
                value: buildStoredSystemVendorHidPeripheralIdentity(identity.evidence),
            };
        case "bluetooth":
            return {
                case: "bluetoothIdentity",
                value: create(SystemPeripheralIdentity_BluetoothIdentitySchema, {
                    primaryIdentifier: buildStoredSystemBluetoothPeripheralIdentifier(
                        identity.evidence.primaryIdentifier,
                    ),
                    fallbackIdentifier: buildStoredSystemBluetoothPeripheralIdentifier(
                        identity.evidence.fallbackIdentifier,
                    ),
                }),
            };
    }
}

function buildStoredSystemVendorHidPeripheralIdentity(
    identity: ResolvedSystemVendorHidPeripheralIdentity,
) {
    return create(SystemPeripheralIdentity_VendorHidIdentitySchema, {
        vendorId: identity.vendorId,
        productId: identity.productId,
        manufacturer: identity.manufacturer,
        productName: identity.productName,
        serialNumber: identity.serialNumber,
        interfaceNumber: identity.interfaceNumber,
        usagePage: identity.usagePage,
        usageId: identity.usageId,
        bindingTransport: identity.bindingTransport === undefined
            ? undefined
            : storedSystemPeripheralBindingTransportByResolved[identity.bindingTransport],
        receiverKind: identity.receiverKind === undefined
            ? undefined
            : storedSystemPeripheralReceiverKindByResolved[identity.receiverKind],
        vendorUnitId: identity.vendorUnitId,
        modelId: identity.modelId,
        receiverSlot: identity.receiverSlot,
    });
}

function buildStoredSystemBluetoothPeripheralIdentifier(
    identifier: ResolvedSystemBluetoothPeripheralIdentifier | undefined,
) {
    if (identifier === undefined) {
        return undefined;
    }

    return create(SystemPeripheralIdentity_BluetoothIdentity_IdentifierSchema, {
        kind: storedBluetoothIdentifierKindByResolved[identifier.kind],
        hash: identifier.hash,
    });
}

const storedBluetoothIdentifierKindByResolved: Record<
    ResolvedSystemBluetoothPeripheralIdentifier["kind"],
    StoredBluetoothIdentifierKind
> = {
    platformInstanceId: StoredBluetoothIdentifierKind.PLATFORM_INSTANCE_ID,
    windowsAepAddress: StoredBluetoothIdentifierKind.WINDOWS_AEP_ADDRESS,
    bluetoothDeviceAddress: StoredBluetoothIdentifierKind.BLUETOOTH_DEVICE_ADDRESS,
};
