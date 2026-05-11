import { create, fromBinary, fromJson, toBinary, toJson } from "@bufbuild/protobuf";
import protobuf from "protobufjs";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { TransitSystemSchema } from "./generated/kivotos/rail/v1/transit_system_pb.js";

const iterationCount = Number.parseInt(process.env.PROTO_BENCH_ITERATIONS ?? "20000", 10);
const warmupCount = Math.min(2000, Math.max(100, Math.floor(iterationCount / 10)));
const benchmarkDirectory = dirname(fileURLToPath(import.meta.url));
const protoPath = join(benchmarkDirectory, "kivotos/rail/v1/transit_system.proto");
const jsonObjectOptions = {
    longs: String,
    enums: String,
    bytes: String,
    defaults: false,
    arrays: true,
    objects: true,
};

const protobufjsRoot = await protobuf.load(protoPath);
const protobufjsTransitSystem = protobufjsRoot.lookupType("kivotos.rail.v1.TransitSystem");
const payload = buildBenchmarkPayload();
const protobufjsPayload = stringifyBigInts(payload);
const protobufEsMessage = create(TransitSystemSchema, payload);
const protobufjsMessage = protobufjsTransitSystem.fromObject(protobufjsPayload);
const protobufEsBinary = toBinary(TransitSystemSchema, protobufEsMessage);
const protobufjsBinary = protobufjsTransitSystem.encode(protobufjsMessage).finish();
const protobufEsJsonObject = toJson(TransitSystemSchema, protobufEsMessage);
const protobufjsJsonObject = protobufjsTransitSystem.toObject(protobufjsMessage, jsonObjectOptions);
const protobufEsJsonString = JSON.stringify(protobufEsJsonObject);
const protobufjsJsonString = JSON.stringify(protobufjsJsonObject);

const results = [
    measure("protobuf-es toBinary", () => toBinary(TransitSystemSchema, protobufEsMessage)),
    measure("protobufjs encode", () => protobufjsTransitSystem.encode(protobufjsMessage).finish()),
    measure("protobuf-es fromBinary", () => fromBinary(TransitSystemSchema, protobufEsBinary)),
    measure("protobufjs decode", () => protobufjsTransitSystem.decode(protobufjsBinary)),
    measure("protobuf-es toJson", () => toJson(TransitSystemSchema, protobufEsMessage)),
    measure("protobufjs toObject", () => protobufjsTransitSystem.toObject(protobufjsMessage, jsonObjectOptions)),
    measure("protobuf-es fromJson", () => fromJson(TransitSystemSchema, protobufEsJsonObject)),
    measure("protobufjs fromObject", () => protobufjsTransitSystem.fromObject(protobufjsJsonObject)),
    measure("protobuf-es JSON.stringify", () => JSON.stringify(protobufEsJsonObject)),
    measure("protobufjs JSON.stringify", () => JSON.stringify(protobufjsJsonObject)),
    measure("protobuf-es JSON.parse + fromJson", () => {
        const parsedJson = JSON.parse(protobufEsJsonString);
        return fromJson(TransitSystemSchema, parsedJson);
    }),
    measure("protobufjs JSON.parse + fromObject", () => {
        const parsedJson = JSON.parse(protobufjsJsonString);
        return protobufjsTransitSystem.fromObject(parsedJson);
    }),
];

console.log(JSON.stringify({
    benchmark: "protobuf-es-vs-protobufjs",
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    iterationCount,
    warmupCount,
    payload: {
        lineCount: payload.lines.length,
        stationCount: Object.keys(payload.stationIndex).length,
        trainCount: payload.lines.reduce((total, line) => total + line.trains.length, 0),
        readingSampleCount: countReadingSamples(payload),
    },
    sizes: {
        protobufEsBinaryBytes: protobufEsBinary.length,
        protobufjsBinaryBytes: protobufjsBinary.length,
        protobufEsJsonBytes: Buffer.byteLength(protobufEsJsonString),
        protobufjsJsonBytes: Buffer.byteLength(protobufjsJsonString),
    },
    results,
}, null, 2));

function measure(name, operation) {
    let checksum = 0;

    for (let index = 0; index < warmupCount; index += 1) {
        checksum += consume(operation());
    }

    const startedAt = performance.now();

    for (let index = 0; index < iterationCount; index += 1) {
        checksum += consume(operation());
    }

    const elapsedMilliseconds = performance.now() - startedAt;

    return {
        name,
        elapsedMilliseconds: round(elapsedMilliseconds),
        operationsPerSecond: Math.round(iterationCount / (elapsedMilliseconds / 1000)),
        microsecondsPerOperation: round((elapsedMilliseconds * 1000) / iterationCount),
        checksum,
    };
}

function consume(value) {
    if (value instanceof Uint8Array) {
        return value.length;
    }

    if (typeof value === "string") {
        return value.length;
    }

    if (value && typeof value === "object") {
        return Object.keys(value).length;
    }

    return 1;
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

function stringifyBigInts(value) {
    if (typeof value === "bigint") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => stringifyBigInts(item));
    }

    if (value instanceof Uint8Array) {
        return value;
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, stringifyBigInts(nestedValue)]),
        );
    }

    return value;
}

function countReadingSamples(transitSystem) {
    const platformSamples = Object.values(transitSystem.stationIndex).reduce((stationTotal, station) => {
        const stationSamples = station.platforms.reduce((platformTotal, platform) => (
            platformTotal + platform.waitHistorySeconds.length
        ), 0);

        return stationTotal + stationSamples;
    }, 0);
    const trainSamples = transitSystem.lines.reduce((lineTotal, line) => {
        const lineSamples = line.trains.reduce((trainTotal, train) => (
            trainTotal + train.telemetryHistory.length
        ), 0);

        return lineTotal + lineSamples;
    }, 0);

    return platformSamples + trainSamples;
}

function buildBenchmarkPayload() {
    const stations = buildStationIndex();
    const stationIds = Object.keys(stations);
    const lines = Array.from({ length: 4 }, (_, lineIndex) => buildLineOperation(lineIndex, stationIds));

    return {
        systemId: "kivotos-rail-control",
        schemaVersion: 7,
        presentation: {
            grade: 3,
            mapStyle: "holographic-terminal",
            localColors: buildRouteColorScheme("#38bdf8"),
            expressColors: buildRouteColorScheme("#f472b6"),
            eventColors: buildRouteColorScheme("#f97316"),
            maintenanceColors: buildRouteColorScheme("#94a3b8"),
            delayBand: {
                minorDelaySeconds: 180,
                majorDelaySeconds: 600,
                colors: buildRouteColorScheme("#ef4444"),
            },
            transitionSmoothingPercent: 75,
            showTransferGrid: true,
        },
        lines,
        stationIndex: stations,
        controlRoomMemos: {
            "control:angel-24": {
                memoKey: "control:angel-24",
                observedAtMs: 1_785_000_000_001n,
                learnedHeadwaySeconds: 205.5,
                alerts: ["festival-platform-crowding", "signal-room-shift-change"],
            },
            "control:clocktower-07": {
                memoKey: "control:clocktower-07",
                observedAtMs: 1_785_000_000_002n,
                learnedHeadwaySeconds: 312.25,
                alerts: ["rain-route-delay"],
            },
            "control:sanctum-01": {
                memoKey: "control:sanctum-01",
                observedAtMs: 1_785_000_000_003n,
                learnedHeadwaySeconds: 480.75,
                alerts: [],
            },
        },
        operator: {
            operatorId: "kivotos-railway-ops",
            displayName: "Kivotos Railway Operations",
            preferredControlRoom: "angel-24",
            maximumOpenIncidents: 12,
        },
        sharedPresentationOverride: false,
        appliedTimetableEpoch: 42n,
        opaqueState: buildBytes(96, 11),
        disabledServiceFlags: ["midnight-test-loop", "school-festival-express", "maintenance-cargo-hop"],
    };
}

function buildStationIndex() {
    return Object.fromEntries(
        Array.from({ length: 12 }, (_, stationIndex) => {
            const stationId = `station-${stationIndex.toString().padStart(2, "0")}`;

            return [stationId, buildStationNode(stationIndex, stationId)];
        }),
    );
}

function buildStationNode(stationIndex, stationId) {
    return {
        stationId,
        district: (stationIndex % 7) + 1,
        displayName: buildStationName(stationIndex),
        latitudeMicrodegrees: 35_690_000 + stationIndex * 1537,
        longitudeMicrodegrees: 139_700_000 + stationIndex * 2119,
        platforms: Array.from({ length: 3 }, (_, platformIndex) => buildPlatformReading(stationIndex, platformIndex)),
        facilities: Array.from({ length: 2 }, (_, facilityIndex) => buildStationFacility(stationIndex, facilityIndex)),
        labels: {
            districtCode: `district-${(stationIndex % 7) + 1}`,
            transfer: stationIndex % 3 === 0 ? "major" : "minor",
            platformTier: `${stationIndex % 4}`,
        },
        stationIconPng: buildBytes(64, stationIndex),
        lastInspectionAtMs: 1_785_000_100_000n + BigInt(stationIndex * 1000),
        active: stationIndex % 11 !== 0,
        routeOrder: stationIndex,
    };
}

function buildPlatformReading(stationIndex, platformIndex) {
    return {
        platformId: `station-${stationIndex}-platform-${platformIndex}`,
        label: `Platform ${platformIndex + 1}`,
        crowdingScore: 12.5 + stationIndex * 4 + platformIndex,
        routeProgress: Math.min(0.98, 0.15 + stationIndex * 0.04 + platformIndex * 0.08),
        nextArrivalSeconds: 80 + stationIndex * 9 + platformIndex * 25,
        safetyBarrierOnline: platformIndex !== 2 || stationIndex % 5 !== 0,
        waitHistorySeconds: buildReadingHistory(60, stationIndex * 7 + platformIndex * 5),
    };
}

function buildStationFacility(stationIndex, facilityIndex) {
    return {
        facilityId: `facility-${stationIndex}-${facilityIndex}`,
        label: facilityIndex === 0 ? "Transfer Gate" : "Archive Kiosk",
        level: facilityIndex === 0 ? "upper" : "lower",
        open: stationIndex % 6 !== 0 || facilityIndex === 0,
        tags: {
            zone: stationIndex % 2 === 0 ? "north" : "south",
            maintenanceWindow: `${(stationIndex + facilityIndex) % 5}`,
        },
    };
}

function buildLineOperation(lineIndex, stationIds) {
    const lineStationIds = stationIds.slice(lineIndex * 2, lineIndex * 2 + 7);
    const inboundTerminalStationId = lineStationIds[0];
    const outboundTerminalStationId = lineStationIds[lineStationIds.length - 1];

    return {
        lineId: `line-${lineIndex}`,
        lineName: lineIndex + 1,
        displayName: ["Aoba Line", "Sakuragaoka Main Line", "Hoshimi Rapid", "Seiran Loop"][lineIndex],
        grade: (lineIndex % 5) + 1,
        stationIds: lineStationIds,
        inboundTerminalStationId,
        outboundTerminalStationId,
        trains: Array.from({ length: 3 }, (_, trainIndex) => buildTrainSet(lineIndex, trainIndex, lineStationIds)),
        headwaySeconds: 180 + lineIndex * 45,
        timetableRevision: 10_000n + BigInt(lineIndex),
        presentationOverride: {
            grade: lineIndex % 2 === 0 ? 2 : 3,
            colors: buildRouteColorScheme(lineIndex % 2 === 0 ? "#60a5fa" : "#fb7185"),
            transitionSmoothingPercent: 55 + lineIndex * 8,
        },
    };
}

function buildTrainSet(lineIndex, trainIndex, stationIds) {
    const currentStationIndex = trainIndex % stationIds.length;
    const destinationStationId = trainIndex % 2 === 0
        ? stationIds[stationIds.length - 1]
        : stationIds[0];

    return {
        trainId: `train-${lineIndex}-${trainIndex}`,
        formation: ((lineIndex + trainIndex) % 5) + 1,
        lineId: `line-${lineIndex}`,
        currentStationId: stationIds[currentStationIndex],
        nextStationId: stationIds[(currentStationIndex + 1) % stationIds.length],
        destinationStationId,
        serviceStatus: trainIndex === 2 && lineIndex % 2 === 1 ? 2 : 1,
        speedKph: 42.5 + lineIndex * 7 + trainIndex * 3,
        routeProgress: Math.min(0.99, 0.2 + lineIndex * 0.1 + trainIndex * 0.05),
        carriages: Array.from({ length: 6 }, (_, carriageIndex) => buildTrainCarriage(lineIndex, trainIndex, carriageIndex)),
        telemetryHistory: buildReadingHistory(60, lineIndex * 13 + trainIndex * 9),
        labels: {
            depot: lineIndex % 2 === 0 ? "angel-yard" : "clocktower-yard",
            driverMode: trainIndex % 2 === 0 ? "auto" : "manual",
        },
        beaconPayload: buildBytes(80, lineIndex * 17 + trainIndex),
        observedAtMs: 1_785_000_200_000n + BigInt(lineIndex * 10_000 + trainIndex * 1000),
    };
}

function buildTrainCarriage(lineIndex, trainIndex, carriageIndex) {
    return {
        carriageId: `car-${lineIndex}-${trainIndex}-${carriageIndex}`,
        seatCount: 48 + carriageIndex * 2,
        occupancyRatio: Math.min(0.97, 0.25 + lineIndex * 0.08 + trainIndex * 0.06 + carriageIndex * 0.03),
        cabinTemperatureCelsius: 21.5 + ((lineIndex + trainIndex + carriageIndex) % 4),
        faultCodes: carriageIndex === 5 && trainIndex === 2 ? ["door-sensor-review"] : [],
    };
}

function buildRouteColorScheme(seedColor) {
    return {
        primaryColor: seedColor,
        secondaryColor: "#22c55e",
        accentColor: "#eab308",
        warningColor: "#ef4444",
    };
}

function buildReadingHistory(length, seed) {
    return Array.from({ length }, (_, index) => {
        const wave = Math.sin((index + seed) / 5) * 12;
        const trend = (index % 17) * 0.8;

        return round(Math.max(0, 45 + wave + trend));
    });
}

function buildStationName(stationIndex) {
    return [
        "Aoba Gakuenmae",
        "Shiratori Jogakuen",
        "Kisaragi Kogyo",
        "Seiran Chuo",
        "Momiji Koen",
        "Tsukikage Depot",
        "Hoshihara Terminal",
        "Sakuragaoka",
        "Amatsuki",
        "Kazemachi",
        "Nanatsumori",
        "Mizukami",
    ][stationIndex];
}

function buildBytes(length, seed) {
    return Uint8Array.from({ length }, (_, index) => (index * 31 + seed * 17) % 256);
}
