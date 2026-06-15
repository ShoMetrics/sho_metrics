import { createServer } from "node:http";
import { networkInterfaces } from "node:os";

const DEFAULT_PRIMARY_PORT = 8091;
const DEFAULT_REDIRECT_PORT = 8092;
const BASIC_USERNAME = "111111";
const BASIC_PASSWORD = "111111";
const BEARER_TOKEN = "bearer-token-12345";
const HEADER_NAME = "x-api-key";
const HEADER_TOKEN = "header-token-12345";
const QUERY_PARAMETER_NAME = "api_key";
const QUERY_TOKEN = "query-token-12345";

const primaryPort = readIntegerArgument("--port", DEFAULT_PRIMARY_PORT);
const redirectPort = readIntegerArgument("--redirect-port", DEFAULT_REDIRECT_PORT);
const host = readStringArgument("--host", "0.0.0.0");

const primaryServer = createServer((request, response) => {
    handleRequest(request, response, primaryPort, redirectPort);
});
const redirectServer = createServer((request, response) => {
    handleRequest(request, response, redirectPort, primaryPort);
});

await Promise.all([
    listen(primaryServer, primaryPort, host),
    listen(redirectServer, redirectPort, host),
]);

writeStartupInstructions(primaryPort, redirectPort);

function handleRequest(request, response, currentPort, otherPort) {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${currentPort}`}`);
    const pathName = requestUrl.pathname;

    if (pathName === "/data.json") {
        sendJson(response, buildMetricPayload("public", requestUrl));
        return;
    }

    if (pathName === "/large.json") {
        sendJson(response, buildLargeSensorPayload());
        return;
    }

    if (pathName === "/error.json") {
        response.writeHead(429, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
            error: true,
            reason: "Smoke test daily request limit exceeded.",
        }));
        return;
    }

    if (pathName === "/auth/basic.json") {
        if (!hasBasicAuth(request)) {
            sendUnauthorized(response, "Basic realm=\"ShoMetricsSmoke\"");
            return;
        }
        sendJson(response, buildMetricPayload("basic", requestUrl));
        return;
    }

    if (pathName === "/auth/bearer.json") {
        if (request.headers.authorization !== `Bearer ${BEARER_TOKEN}`) {
            sendUnauthorized(response);
            return;
        }
        sendJson(response, buildMetricPayload("bearer", requestUrl));
        return;
    }

    if (pathName === "/auth/header.json") {
        if (request.headers[HEADER_NAME] !== HEADER_TOKEN) {
            sendUnauthorized(response);
            return;
        }
        sendJson(response, buildMetricPayload("header", requestUrl));
        return;
    }

    if (pathName === "/auth/query.json") {
        if (requestUrl.searchParams.get(QUERY_PARAMETER_NAME) !== QUERY_TOKEN) {
            sendUnauthorized(response);
            return;
        }
        sendJson(response, buildMetricPayload("query", requestUrl));
        return;
    }

    if (pathName === "/auth/query-echo.json") {
        if (requestUrl.searchParams.get(QUERY_PARAMETER_NAME) !== QUERY_TOKEN) {
            sendUnauthorized(response);
            return;
        }
        sendJson(response, {
            metric: {
                label: "Echo",
                value: 42,
                unit: "custom",
                customUnit: "ok",
            },
            links: {
                self: requestUrl.href,
            },
            token: QUERY_TOKEN,
        });
        return;
    }

    if (pathName === "/redirect/same-origin.json") {
        redirect(response, `http://127.0.0.1:${currentPort}/data.json`);
        return;
    }

    if (pathName === "/redirect/cross-origin.json") {
        redirect(response, `http://127.0.0.1:${otherPort}/data.json`);
        return;
    }

    if (pathName === "/redirect/cross-origin-auth-header.json") {
        if (request.headers[HEADER_NAME] !== HEADER_TOKEN) {
            sendUnauthorized(response);
            return;
        }
        redirect(response, `http://127.0.0.1:${otherPort}/data.json`);
        return;
    }

    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
        error: true,
        reason: `No smoke endpoint for ${pathName}.`,
    }));
}

function buildMetricPayload(kind, requestUrl) {
    return {
        source: "custom-http-smoke",
        kind,
        current: {
            label: `${kind} smoke`,
            value: 42.5,
            unit: "celsius",
            maximum: 100,
            suggestedLucideIconId: "thermometer",
        },
        links: {
            self: requestUrl.href,
        },
    };
}

function buildLargeSensorPayload() {
    return {
        Name: "ShoMetrics Smoke Hardware",
        Children: [
            {
                Text: "CPU",
                Children: buildSensors("CPU", 160),
            },
            {
                Text: "GPU",
                Children: [
                    ...buildSensors("GPU", 180),
                    {
                        Text: "GPU Core",
                        SensorId: "/gpu-nvidia/0/temperature/0",
                        Type: "Temperature",
                        Value: "52.0 °C",
                        RawValue: 52,
                    },
                ],
            },
        ],
    };
}

function buildSensors(prefix, count) {
    return Array.from({ length: count }, (_, index) => ({
        Text: `${prefix} Sensor ${index}`,
        SensorId: `/${prefix.toLowerCase()}/sensor/${index}`,
        Type: index % 3 === 0 ? "Voltage" : index % 3 === 1 ? "Temperature" : "Load",
        Value: index % 3 === 0 ? `${(1 + index / 100).toFixed(3)} V` : index % 3 === 1 ? `${30 + index} °C` : `${index % 100} %`,
        RawValue: index,
    }));
}

function hasBasicAuth(request) {
    const expected = `Basic ${Buffer.from(`${BASIC_USERNAME}:${BASIC_PASSWORD}`).toString("base64")}`;
    return request.headers.authorization === expected;
}

function sendJson(response, body) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
}

function sendUnauthorized(response, wwwAuthenticate) {
    const headers = { "content-type": "application/json; charset=utf-8" };
    if (wwwAuthenticate !== undefined) {
        headers["www-authenticate"] = wwwAuthenticate;
    }
    response.writeHead(401, headers);
    response.end(JSON.stringify({
        error: true,
        reason: "Smoke endpoint requires the configured credential.",
    }));
}

function redirect(response, location) {
    response.writeHead(302, { location });
    response.end();
}

function listen(server, port, hostName) {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostName, () => {
            server.off("error", reject);
            resolve();
        });
    });
}

function readStringArgument(name, defaultValue) {
    const index = process.argv.indexOf(name);
    if (index === -1) {
        return defaultValue;
    }
    const value = process.argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${name}.`);
    }
    return value;
}

function readIntegerArgument(name, defaultValue) {
    const rawValue = readStringArgument(name, String(defaultValue));
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return value;
}

function writeStartupInstructions(port, secondPort) {
    const localBaseUrl = `http://127.0.0.1:${port}`;
    const lanBaseUrls = readLanBaseUrls(port);
    const publicHttpConsentHost = "shometrics-smoke.test";
    const publicHttpConsentBaseUrl = `http://${publicHttpConsentHost}:${port}`;
    const lines = [
        "",
        "Custom HTTP smoke server is running.",
        "",
        `Primary base URL: ${localBaseUrl}`,
        `Redirect target base URL: http://127.0.0.1:${secondPort}`,
        ...lanBaseUrls.map(url => `Private LAN URL, no public-HTTP consent expected: ${url}`),
        "",
        "Public-HTTP consent test:",
        `1. Add this hosts entry: 127.0.0.1 ${publicHttpConsentHost}`,
        `2. Use this URL with a credential: ${publicHttpConsentBaseUrl}/auth/basic.json`,
        "This hostname is intentionally not localhost, .local, or a private IP, so the PI should require public-HTTP credential consent.",
        "",
        "Credentials:",
        `Basic Auth: username=${BASIC_USERNAME} password=${BASIC_PASSWORD}`,
        `Bearer header: token=${BEARER_TOKEN}`,
        `API-key header: header=${HEADER_NAME} value=${HEADER_TOKEN}`,
        `API-key query: parameter=${QUERY_PARAMETER_NAME} value=${QUERY_TOKEN}`,
        "",
        "PI smoke cases:",
        `No auth: ${localBaseUrl}/data.json`,
        `Large JSON digest/exploration: ${localBaseUrl}/large.json`,
        `HTTP failure preview: ${localBaseUrl}/error.json`,
        `Basic Auth: ${localBaseUrl}/auth/basic.json`,
        `Bearer: ${localBaseUrl}/auth/bearer.json`,
        `API-key header: ${localBaseUrl}/auth/header.json`,
        `API-key query: ${localBaseUrl}/auth/query.json`,
        `Query echo redaction: ${localBaseUrl}/auth/query-echo.json?${QUERY_PARAMETER_NAME}=old-value`,
        `Same-origin redirect should work: ${localBaseUrl}/redirect/same-origin.json`,
        `No-auth cross-origin redirect should work: ${localBaseUrl}/redirect/cross-origin.json`,
        `Credential-header cross-origin redirect should block: ${localBaseUrl}/redirect/cross-origin-auth-header.json`,
        "",
        "Useful jq filters:",
        "Final metric for /data.json and auth endpoints:",
        ".current | {metric:{label:.label,value:.value,unit:.unit,maximum:.maximum,suggestedLucideIconId:\"thermometer\"}}",
        "",
        "Final metric for /auth/query-echo.json:",
        ".metric | {metric:.}",
        "",
        "Exploration query for /large.json:",
        ".. | objects | select((.Type? == \"Temperature\") or (.Text? | tostring | test(\"GPU|Core|Temperature\"; \"i\"))) | {Text,SensorId,Type,Value,RawValue}",
        "",
        "Final metric for /large.json:",
        "first(.. | objects | select(.Type? == \"Temperature\" and ((.SensorId // \"\") | contains(\"/gpu-nvidia/\")))) as $t | {metric:{label:\"GPU Temp\",value:(($t.RawValue // $t.Value) | tostring | capture(\"(?<n>[0-9.]+)\") | .n | tonumber),unit:\"celsius\",maximum:100,suggestedLucideIconId:\"thermometer\"}}",
        "",
        "Press Ctrl+C to stop.",
        "",
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
}

function readLanBaseUrls(port) {
    return Object.values(networkInterfaces())
        .flatMap(networkInterface => networkInterface ?? [])
        .filter(address => address.family === "IPv4" && !address.internal)
        .map(address => `http://${address.address}:${port}`);
}
