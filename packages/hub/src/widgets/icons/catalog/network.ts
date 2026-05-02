import { ChevronsLeftRightEllipsis, Download, GlobeOff, Network, Upload, Wifi } from "lucide";
import type { IconNode } from "lucide";
import type { ArcGaugeStatusIcon } from "../../primitives/arc-gauge";
import type { NetworkInterfaceOption } from "../../../runtime/network-interfaces";
import type { NetworkDirection } from "../../../runtime/network-metric-keys";
import { createLucideIconDefinition } from "../sources/lucide";
import { renderCenteredIconFragment } from "../render-icon";

const NETWORK_DIRECTION_STATUS_SIZE_RATIO = 2.15;
const NETWORK_DIRECTION_STATUS_OPTICAL_Y_OFFSET_RATIO = 0.55;

export function renderNetworkDirectionIconFragment(options: {
    direction: NetworkDirection;
    color: string;
    size: number;
}): string {
    const iconDefinition = createLucideIconDefinition({
        id: `network.${options.direction}`,
        node: options.direction === "download" ? Download : Upload,
        color: options.color,
        strokeWidth: 2.35,
        opticalScale: 1.08,
    });

    return renderCenteredIconFragment(iconDefinition, options.size);
}

export function getNetworkDirectionStatusIcon(options: {
    direction: NetworkDirection;
    color: string;
}): ArcGaugeStatusIcon {
    return {
        ...createLucideIconDefinition({
            id: `network.direction.${options.direction}`,
            node: options.direction === "download" ? Download : Upload,
            color: options.color,
            strokeWidth: 2.45,
            opticalScale: 1.02,
        }),
        sizeRatio: NETWORK_DIRECTION_STATUS_SIZE_RATIO,
        opticalYOffsetRatio: NETWORK_DIRECTION_STATUS_OPTICAL_Y_OFFSET_RATIO,
    };
}

export function renderNetworkInterfaceIconFragment(options: {
    networkInterface: NetworkInterfaceOption | null;
    size: number;
}): string {
    const iconDefinition = createLucideIconDefinition({
        id: `network.interface.${options.networkInterface?.type ?? "unknown"}`,
        node: resolveNetworkInterfaceIconNode(options.networkInterface),
        strokeWidth: 2.3,
        opticalScale: 1.08,
    });

    return renderCenteredIconFragment(iconDefinition, options.size);
}

function resolveNetworkInterfaceIconNode(networkInterface: NetworkInterfaceOption | null): IconNode {
    if (!networkInterface) {
        return GlobeOff;
    }

    if (networkInterface?.type === "wireless") {
        return Wifi;
    }

    if (networkInterface?.type === "wired") {
        return ChevronsLeftRightEllipsis;
    }

    return Network;
}
