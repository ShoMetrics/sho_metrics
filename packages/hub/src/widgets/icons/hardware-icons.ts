export type HardwareIconKind = "cpu" | "gpu" | "memory";

export function getHardwareIconFragment(kind: HardwareIconKind): string {
    if (kind === "cpu") {
        return renderCpuIconFragment();
    }

    if (kind === "memory") {
        return renderMemoryIconFragment();
    }

    return renderGpuIconFragment();
}

function renderCpuIconFragment(): string {
    return `
        <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
            <rect x="-18" y="-18" width="36" height="36" rx="7" stroke-width="6" />
            <rect x="-8" y="-8" width="16" height="16" rx="3" stroke-width="4" opacity="0.72" />
            <path d="M -26 -12 L -18 -12 M -26 0 L -18 0 M -26 12 L -18 12" stroke-width="4" />
            <path d="M 18 -12 L 26 -12 M 18 0 L 26 0 M 18 12 L 26 12" stroke-width="4" />
            <path d="M -12 -26 L -12 -18 M 0 -26 L 0 -18 M 12 -26 L 12 -18" stroke-width="4" />
            <path d="M -12 18 L -12 26 M 0 18 L 0 26 M 12 18 L 12 26" stroke-width="4" />
        </g>
    `;
}

function renderGpuIconFragment(): string {
    return `
        <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
            <rect x="-24" y="-12" width="48" height="24" rx="2" stroke-width="3" />
            <path d="M-24 -16 v32" stroke-width="3" />
            <path d="M-28 -6 h4 M-28 4 h4" stroke-width="3" />
            <g stroke-width="2.5">
                <circle cx="-10" cy="0" r="7.5" />
                <circle cx="-10" cy="0" r="1.2" fill="rgba(255,255,255,0.88)" stroke="none" />
                <circle cx="12" cy="0" r="7.5" />
                <circle cx="12" cy="0" r="1.2" fill="rgba(255,255,255,0.88)" stroke="none" />
            </g>
            <path d="M-18 12 v5 M-11 12 v5 h28" stroke-width="3" />
        </g>
    `;
}

function renderMemoryIconFragment(): string {
    return `
        <g fill="none" stroke="rgba(255,255,255,0.88)" stroke-linecap="round" stroke-linejoin="round">
            <rect x="-24" y="-16" width="48" height="32" rx="5" stroke-width="5" />
            <path d="M -12 -6 L -12 6 M 0 -6 L 0 6 M 12 -6 L 12 6" stroke-width="4" opacity="0.78" />
            <path d="M -18 -24 L -18 -16 M -6 -24 L -6 -16 M 6 -24 L 6 -16 M 18 -24 L 18 -16" stroke-width="4" />
            <path d="M -18 16 L -18 24 M -6 16 L -6 24 M 6 16 L 6 24 M 18 16 L 18 24" stroke-width="4" />
        </g>
    `;
}
