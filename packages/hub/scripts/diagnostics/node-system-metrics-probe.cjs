/* eslint-disable @typescript-eslint/no-require-imports */
// This file is a quick script used to expose system metrics from a Node.js environment for reference.

const { execFile } = require("node:child_process");
const si = require("systeminformation");

const NVIDIA_SMI_QUERY_FIELDS = [
    "utilization.gpu",
    "name",
    "temperature.gpu",
    "memory.used",
    "memory.total",
    "power.draw",
    "power.limit",
];

const NVIDIA_SMI_ARGUMENTS = [
    `--query-gpu=${NVIDIA_SMI_QUERY_FIELDS.join(",")}`,
    "--format=csv,noheader,nounits",
];

const NVIDIA_SMI_TIMEOUT_MS = 3000;

function runNvidiaSmi() {
    return new Promise((resolve) => {
        const startedAt = Date.now();

        execFile(
            "nvidia-smi",
            NVIDIA_SMI_ARGUMENTS,
            {
                timeout: NVIDIA_SMI_TIMEOUT_MS,
                windowsHide: true,
                maxBuffer: 64 * 1024,
            },
            (error, stdout, stderr) => {
                resolve({
                    ok: !error,
                    elapsedMilliseconds: Date.now() - startedAt,
                    error: error
                        ? {
                            name: error.name,
                            message: error.message,
                            code: error.code,
                            signal: error.signal,
                            killed: error.killed,
                        }
                        : null,
                    stdout,
                    stderr,
                });
            },
        );
    });
}

async function collectSection(name, read) {
    const startedAt = Date.now();

    try {
        const value = await read();

        return {
            ok: true,
            elapsedMilliseconds: Date.now() - startedAt,
            value,
            shape: summarizeShape(value),
        };
    } catch (error) {
        return {
            ok: false,
            elapsedMilliseconds: Date.now() - startedAt,
            error: {
                name: error?.name,
                message: error?.message,
                stack: error?.stack,
            },
        };
    }
}

function summarizeShape(value) {
    if (Array.isArray(value)) {
        return {
            type: "array",
            length: value.length,
            firstItemKeys: value[0] && typeof value[0] === "object"
                ? Object.keys(value[0]).sort()
                : [],
        };
    }

    if (value && typeof value === "object") {
        return {
            type: "object",
            keys: Object.keys(value).sort(),
        };
    }

    return {
        type: typeof value,
    };
}

async function main() {
    const report = {
        metadata: {
            capturedAt: new Date().toISOString(),
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            systeminformationVersion: require("systeminformation/package.json").version,
        },
        sections: {
            cpu: await collectSection("cpu", () => si.cpu()),
            currentLoad: await collectSection("currentLoad", () => si.currentLoad()),
            mem: await collectSection("mem", () => si.mem()),
            fsSize: await collectSection("fsSize", () => si.fsSize()),
            blockDevices: await collectSection("blockDevices", () => si.blockDevices()),
            diskLayout: await collectSection("diskLayout", () => si.diskLayout()),
            fsStats: await collectSection("fsStats", () => si.fsStats()),
            networkInterfaces: await collectSection("networkInterfaces", () => si.networkInterfaces()),
            networkStatsAll: await collectSection("networkStatsAll", () => si.networkStats("*")),
            graphics: await collectSection("graphics", () => si.graphics()),
            nvidiaSmi: await collectSection("nvidiaSmi", () => runNvidiaSmi()),
        },
    };

    console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
