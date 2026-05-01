export type HardwareIconKind = "cpu" | "gpu" | "memory" | "disk";
export type DiskIconKind = "ssd" | "hdd" | "unknown";

export interface HardwareIcon {
    fragment: string;
    viewBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export function getHardwareIconFragment(kind: HardwareIconKind): string {
    if (kind === "cpu") {
        return renderCpuIconFragment();
    }

    if (kind === "memory") {
        return renderMemoryIconFragment();
    }

    if (kind === "disk") {
        return getDiskIconFragment("unknown");
    }

    return renderGpuIconFragment();
}

export function renderCenteredHardwareIconFragment(icon: HardwareIcon, size: number): string {
    return `
        <svg x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}"
            viewBox="${icon.viewBox.x} ${icon.viewBox.y} ${icon.viewBox.width} ${icon.viewBox.height}"
            preserveAspectRatio="xMidYMid meet">
            ${icon.fragment}
        </svg>
    `;
}

export function getDiskIcon(kind: DiskIconKind): HardwareIcon {
    return kind === "ssd"
        ? {
            viewBox: { x: 0, y: 0, width: 60, height: 60 },
            fragment: renderSolidStateDriveIconFragment(),
        }
        : {
            viewBox: { x: 0, y: 0, width: 512, height: 512 },
            fragment: renderHardDiskDriveIconFragment(),
        };
}

export function getDiskIconFragment(kind: DiskIconKind): string {
    return renderCenteredHardwareIconFragment(getDiskIcon(kind), 58);
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
            <!-- PCB Body with Half-Circle Side Notches -->
            <path d="
                M -28 -12 H 28
                V -9  A 3 3 0 0 0 28 -3
                V 1   A 3 3 0 0 0 28 7
                V 10  H -28
                V 7   A 3 3 0 0 0 -28 1
                V -3  A 3 3 0 0 0 -28 -9
                V -12 Z" stroke-width="2.5" />

            <!-- 3 Memory Chips (Strictly Vertically Centered) -->
            <g fill="rgba(255,255,255,0.88)" stroke="none" opacity="0.8">
                <!-- Height is 9, Y from -5.5 to 3.5 (Center at -1) -->
                <rect x="-19" y="-5.5" width="9" height="9" rx="1" />
                <rect x="-4.5" y="-5.5" width="9" height="9" rx="1" />
                <rect x="10" y="-5.5" width="9" height="9" rx="1" />
            </g>

            <!-- Bottom Gold Fingers: Box-style segments with key notch -->
            <g stroke-width="2">
                <!-- Left bank -->
                <path d="M -24 10 v 5 h 4 v -5 M -16 10 v 5 h 4 v -5 M -8 10 v 5 h 4 v -5 M 0 10 v 5 h 4 v -5" />
                <!-- Right bank (offset to create the gap) -->
                <path d="M 10 10 v 5 h 4 v -5 M 18 10 v 5 h 4 v -5" />
            </g>
        </g>
    `;
}

function renderHardDiskDriveIconFragment(): string {
    return `
        <g fill="rgba(255,255,255,0.88)" stroke="none">
            <path d="M256.005,172.086c-26.385,0-47.793,21.39-47.793,47.793c0,26.385,21.408,47.775,47.793,47.775 s47.793-21.39,47.793-47.775C303.798,193.476,282.39,172.086,256.005,172.086z" />
            <path d="M466.765,12.692C458.862,4.807,448.17,0.01,436.208,0H75.792C63.83,0.01,53.14,4.807,45.236,12.692 c-7.885,7.903-12.683,18.594-12.692,30.556v425.503c0.009,11.963,4.807,22.654,12.692,30.557 C53.14,507.182,63.83,511.99,75.792,512h360.416c11.962-0.01,22.654-4.818,30.557-12.692c7.884-7.903,12.682-18.594,12.691-30.557 V43.248C479.447,31.286,474.649,20.595,466.765,12.692z M151.373,432.752l85.168-120.373c6.06-9.55,18.743-12.421,28.32-6.314 c9.54,6.051,12.392,18.743,6.332,28.293L198.587,462.7c-8.288,13.038-25.562,16.91-38.61,8.624 C146.94,463.046,143.087,445.781,151.373,432.752z M289.787,345.404c11.991-19.557,6.089-45.277-13.299-57.577 c-6.772-4.321-14.591-6.602-22.606-6.602c-14.3,0-27.432,7.099-35.26,19.033l-46.943,66.387 c-50.796-29.246-85.065-83.952-85.065-146.766c0-93.567,75.843-169.41,169.391-169.41c93.557,0,169.401,75.844,169.401,169.41 c0,90.434-70.933,164.107-160.178,168.933L289.787,345.404z M109.958,57.679c0,12.88-10.466,23.336-23.345,23.336 c-12.898,0-23.355-10.457-23.355-23.336c0-12.897,10.457-23.363,23.355-23.363C99.492,34.316,109.958,44.782,109.958,57.679z M86.614,430.984c12.879,0,23.345,10.457,23.345,23.355c0,12.888-10.466,23.345-23.345,23.345 c-12.898,0-23.355-10.456-23.355-23.345C63.259,441.441,73.716,430.984,86.614,430.984z M402.051,454.339 c0-12.898,10.456-23.355,23.335-23.355c12.898,0,23.364,10.457,23.364,23.355c0,12.888-10.466,23.345-23.364,23.345 C412.508,477.684,402.051,467.228,402.051,454.339z M425.386,81.016c-12.879,0-23.335-10.457-23.335-23.336 c0-12.897,10.456-23.363,23.335-23.363c12.898,0,23.364,10.466,23.364,23.363C448.751,70.559,438.284,81.016,425.386,81.016z" />
        </g>
    `;
}

function renderSolidStateDriveIconFragment(): string {
    return `
        <g fill="rgba(255,255,255,0.88)" stroke="none">
            <circle cx="5" cy="13" r="1" />
            <circle cx="5" cy="47" r="1" />
            <circle cx="55" cy="13" r="1" />
            <circle cx="55" cy="47" r="1" />
            <path d="M45.275,34.813c-1.294-2.947-5.705-3.765-10.044-1.857c-1.993,0.876-3.66,2.207-4.692,3.749 c-1.125,1.68-1.386,3.422-0.734,4.905c0.652,1.483,2.111,2.469,4.109,2.777c0.43,0.065,0.875,0.099,1.33,0.099 c1.485,0,3.079-0.349,4.604-1.02C44.187,41.562,46.57,37.76,45.275,34.813L45.275,34.813z M39.044,41.636 c-1.648,0.725-3.362,1.003-4.825,0.774c-1.299-0.199-2.216-0.77-2.583-1.604c-0.366-0.835-0.166-1.896,0.564-2.988 c0.824-1.229,2.186-2.305,3.836-3.03c1.306-0.573,2.644-0.85,3.825-0.85c1.715,0,3.101,0.582,3.584,1.681 C44.26,37.474,42.244,40.229,39.044,41.636z" />
            <path d="M56.911,8H34H3.089C1.386,8,0,9.386,0,11.089V34v14.911C0,50.614,1.386,52,3.089,52h53.822C58.614,52,60,50.614,60,48.911 V44V18v-6.911C60,9.386,58.614,8,56.911,8z M2,11.089C2,10.488,2.488,10,3.089,10h28.89C31.453,22.22,21.347,32,9,32H2V11.089z M58,21h-3v2h3v1h-3v2h3v1h-3v2h3v1h-3v2h3v4h-3v2h3v1h-2v2h2v1h-2.465L54,39.697V20h4V21z M58,18h-6v22.303L54.465,44H58v4.911 C58,49.512,57.512,50,56.911,50H3.089C2.488,50,2,49.512,2,48.911V34h7c13.45,0,24.447-10.677,24.975-24h22.937 c0.6,0,1.088,0.488,1.088,1.089V18z" />
            <rect x="4" y="28" width="2" height="2" />
            <rect x="4" y="25" width="2" height="2" />
            <rect x="4" y="22" width="2" height="2" />
            <rect x="4" y="19" width="2" height="2" />
            <rect x="4" y="16" width="2" height="2" />
            <rect x="10" y="14" width="13" height="2" />
            <rect x="10" y="17" width="10" height="2" />
            <rect x="10" y="20" width="11" height="2" />
            <rect x="10" y="23" width="4" height="2" />
        </g>
    `;
}
