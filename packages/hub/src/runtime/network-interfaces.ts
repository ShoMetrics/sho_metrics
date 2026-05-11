import type { NetworkInterfaceCacheItem } from "../settings/model";

export type NetworkInterfaceOption = NetworkInterfaceCacheItem;

class NetworkInterfaceRegistry {
    private options: NetworkInterfaceOption[] = [];

    update(options: readonly NetworkInterfaceOption[]): void {
        this.options = [...options].sort(compareNetworkInterfaceOptions);
    }

    getOptions(): readonly NetworkInterfaceOption[] {
        return this.options;
    }

    findById(id: string | null): NetworkInterfaceOption | null {
        if (!id) {
            return null;
        }

        return this.options.find((networkInterface) => networkInterface.id === id) ?? null;
    }

    resolveAutomaticSelection(): NetworkInterfaceOption | null {
        return [...this.options]
            .sort(compareAutomaticNetworkInterfaceOptions)[0]
            ?? null;
    }

    resolveSelection(networkInterfaceId: string): NetworkInterfaceOption | null {
        if (networkInterfaceId.length > 0) {
            return this.findById(networkInterfaceId);
        }

        return this.resolveAutomaticSelection();
    }

    resolveMaximumAutomaticSpeedMegabitsPerSecond(): number | null {
        return this.options.reduce<number | null>((maximumSpeed, networkInterface) => {
            if (!networkInterface.speedMegabitsPerSecond) {
                return maximumSpeed;
            }

            return Math.max(maximumSpeed ?? 0, networkInterface.speedMegabitsPerSecond);
        }, null);
    }
}

function compareAutomaticNetworkInterfaceOptions(
    firstOption: NetworkInterfaceOption,
    secondOption: NetworkInterfaceOption,
): number {
    const speedDifference = (secondOption.speedMegabitsPerSecond ?? 0) - (firstOption.speedMegabitsPerSecond ?? 0);

    if (speedDifference !== 0) {
        return speedDifference;
    }

    return compareNetworkInterfaceOptions(firstOption, secondOption);
}

function compareNetworkInterfaceOptions(
    firstOption: NetworkInterfaceOption,
    secondOption: NetworkInterfaceOption,
): number {
    if (firstOption.isDefault !== secondOption.isDefault) {
        return firstOption.isDefault ? -1 : 1;
    }

    if (firstOption.type !== secondOption.type) {
        return networkTypeRank(firstOption.type) - networkTypeRank(secondOption.type);
    }

    return firstOption.name.localeCompare(secondOption.name);
}

function networkTypeRank(type: NetworkInterfaceOption["type"]): number {
    if (type === "wired") {
        return 0;
    }

    if (type === "wireless") {
        return 1;
    }

    return 2;
}

export const networkInterfaceRegistry = new NetworkInterfaceRegistry();
