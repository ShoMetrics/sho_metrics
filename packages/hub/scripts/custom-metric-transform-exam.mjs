#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_ENDPOINT = "http://localhost:11434/api/chat";
const DEFAULT_MODEL = "qwen3.6:latest";
const DEFAULT_CORPUS_ROOT = join("docs", "development", "runtime-sources", "05-custom-metrics", "poc-corpus");
const DEFAULT_OUTPUT_ROOT = join("artifacts", "custom-metric-poc");
const MODEL_PROVIDERS = new Set(["openai-compatible", "ollama"]);
const DEFAULT_ROUNDS = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_MAX_TOKENS = 1536;
const MANUAL_RULE_TERMINATOR = "<<<SHOMETRICS_RULE_DONE>>>";
const SUPPORTED_UNITS = [
    "percent",
    "celsius",
    "fahrenheit",
    "watts",
    "bytes",
    "bytes_per_second",
    "milliseconds",
    "seconds",
    "hertz",
    "rpm",
    "unitless",
    "custom",
];

await runMain();

async function runMain() {
    let options;

    try {
        options = parseCommandLine(process.argv.slice(2));
    } catch (error) {
        writeJson({
            ok: false,
            stage: "arguments",
            message: toBoundedMessage(error),
        });
        process.exitCode = 2;
        return;
    }

    if (options.help) {
        printUsage();
        return;
    }

    if (options.interactive) {
        await runInteractiveExam(options);
        return;
    }

    if (!options.caseName || !options.engine) {
        writeJson({
            ok: false,
            stage: "arguments",
            message: "Missing --case or --engine.",
        });
        process.exitCode = 2;
        return;
    }

    if (options.engine !== "jq-wasm" && options.engine !== "jsonata") {
        writeJson({
            ok: false,
            stage: "arguments",
            message: "Unsupported engine. Use jq-wasm or jsonata.",
        });
        process.exitCode = 2;
        return;
    }

    if (!MODEL_PROVIDERS.has(options.provider)) {
        writeJson({
            ok: false,
            stage: "arguments",
            message: "Unsupported provider. Use openai-compatible or ollama.",
        });
        process.exitCode = 2;
        return;
    }

    const caseDirectory = join(options.corpusRoot, options.caseName);
    const inputPath = join(caseDirectory, "input.json");
    const defaultIntentPath = join(caseDirectory, "intent.txt");
    const expectedPath = join(caseDirectory, "expected.metrics.json");
    const outputDirectory = join(options.outputRoot, options.caseName, "model-runs", sanitizePathSegment(options.model), options.engine);
    const extension = options.engine === "jq-wasm" ? "jq" : "jsonata";

    let inputText;
    let displayIntent;

    try {
        inputText = await readFile(inputPath, "utf8");
        displayIntent = await readDisplayIntent(options, defaultIntentPath);
        await mkdir(outputDirectory, { recursive: true });
    } catch (error) {
        writeJson({
            ok: false,
            stage: "read",
            message: toBoundedMessage(error),
        });
        process.exitCode = 1;
        return;
    }

    const prompt = buildTransformPrompt(options.engine, inputText, displayIntent);
    const results = [];

    for (let round = 1; round <= options.rounds; round += 1) {
        writeProgress(`case=${options.caseName} engine=${options.engine} model=${options.model} round=${round}/${options.rounds}`);

        const rawOutputPath = join(outputDirectory, `round-${round}.raw.txt`);
        const transformPath = join(outputDirectory, `round-${round}.${extension}`);

        try {
            const modelOutput = await requestTransform(options, prompt);
            const transformText = extractTransform(modelOutput.transformContent);
            await writeFile(rawOutputPath, formatModelRawOutput(modelOutput), "utf8");
            await writeFile(transformPath, transformText, "utf8");

            if (containsThinkingTag(transformText)) {
                results.push({
                    round,
                    ok: false,
                    schemaOk: false,
                    expectedOk: false,
                    stage: "model-output",
                    message: "Extracted transform still contains a thinking tag.",
                    rawOutputPath,
                    transformPath,
                });
                continue;
            }

            const schemaValidationResult = await runTransformValidation({
                engine: options.engine,
                inputPath,
                transformPath,
            });
            const expectedValidationResult = options.compareExpected
                ? await runTransformValidation({
                    engine: options.engine,
                    inputPath,
                    transformPath,
                    expectedPath,
                })
                : undefined;

            results.push({
                round,
                ok: options.compareExpected
                    ? expectedValidationResult?.ok === true
                    : schemaValidationResult.ok === true,
                schemaOk: schemaValidationResult.ok === true,
                expectedOk: expectedValidationResult?.ok === true,
                transformPath,
                rawOutputPath,
                schemaStage: schemaValidationResult.stage,
                schemaMessage: schemaValidationResult.message,
                expectedStage: expectedValidationResult?.stage,
                expectedMessage: expectedValidationResult?.message,
                metricCount: schemaValidationResult.metricCount,
                durationMs: schemaValidationResult.durationMs,
            });
        } catch (error) {
            results.push({
                round,
                ok: false,
                stage: "model",
                message: toBoundedMessage(error),
            });
        }
    }

    const successCount = results.filter((result) => result.ok).length;
    const schemaSuccessCount = results.filter((result) => result.schemaOk).length;
    writeJson({
        ok: successCount === options.rounds,
        caseName: options.caseName,
        engine: options.engine,
        model: options.model,
        provider: options.provider,
        displayIntent,
        rounds: options.rounds,
        successCount,
        schemaSuccessCount,
        results,
    });
}

async function readDisplayIntent(options, defaultIntentPath) {
    if (options.intentText) {
        return options.intentText;
    }

    const intentPath = options.intentPath ?? defaultIntentPath;
    const intentText = (await readFile(intentPath, "utf8")).trim();
    if (intentText.length === 0) {
        throw new Error("Display intent must not be empty.");
    }

    return intentText;
}

async function runInteractiveExam(options) {
    const terminal = createLineReader();

    try {
        const caseNames = await readCorpusCaseNames(options.corpusRoot);
        if (caseNames.length === 0) {
            throw new Error(`No cases found under ${options.corpusRoot}.`);
        }

        output.write("Available cases:\n");
        for (const [index, caseName] of caseNames.entries()) {
            output.write(`  ${index + 1}. ${caseName}\n`);
        }

        const selectedCases = await askSelectedCases(terminal, caseNames);
        const selectedEngines = await askSelectedEngines(terminal);
        const rounds = await askRoundCount(terminal);
        const shouldCopyPromptToClipboard = await askClipboardPreference(terminal);
        const results = [];

        for (const caseName of selectedCases) {
            const caseDirectory = join(options.corpusRoot, caseName);
            const inputPath = join(caseDirectory, "input.json");
            const expectedPath = join(caseDirectory, "expected.metrics.json");
            const inputText = await readFile(inputPath, "utf8");
            const displayIntent = await readDisplayIntent(options, join(caseDirectory, "intent.txt"));

            for (const engine of selectedEngines) {
                const prompt = buildTransformPrompt(engine, inputText, displayIntent);
                for (let round = 1; round <= rounds; round += 1) {
                    output.write(`\n=== ${caseName} / ${engine} / round ${round}/${rounds} ===\n`);
                    if (shouldCopyPromptToClipboard) {
                        const copyResult = await copyTextToClipboard(prompt);
                        output.write(copyResult.ok
                            ? "Prompt copied to clipboard.\n"
                            : `Prompt clipboard copy failed: ${copyResult.message}\n`);
                    }

                    output.write("Copy this prompt to the chatbot:\n");
                    output.write("----- PROMPT START -----\n");
                    output.write(`${prompt}\n`);
                    output.write("----- PROMPT END -----\n");
                    output.write(
                        "Paste the generated rule below.\n"
                        + `Finish by typing ${MANUAL_RULE_TERMINATOR} on its own line and pressing Enter.\n`
                        + "EOF also submits after pasted content "
                        + "(Windows: Ctrl+Z then Enter; Unix: Ctrl+D).\n",
                    );

                    const transformText = await readMultilineRule(terminal);
                    const transformPath = join(
                        options.outputRoot,
                        caseName,
                        "manual-runs",
                        engine,
                        `round-${round}.${engine === "jq-wasm" ? "jq" : "jsonata"}`,
                    );
                    await mkdir(join(options.outputRoot, caseName, "manual-runs", engine), { recursive: true });
                    await writeFile(transformPath, transformText, "utf8");

                    const validationResult = await runTransformValidation({
                        engine,
                        inputPath,
                        transformPath,
                        expectedPath: options.compareExpected ? expectedPath : undefined,
                    });
                    results.push({
                        caseName,
                        engine,
                        round,
                        ok: validationResult.ok === true,
                        stage: validationResult.stage,
                        message: validationResult.message,
                        metricCount: validationResult.metricCount,
                        transformPath,
                    });

                    output.write(validationResult.ok
                        ? `PASS metricCount=${validationResult.metricCount ?? "unknown"}\n`
                        : `FAIL stage=${validationResult.stage ?? "unknown"} message=${validationResult.message ?? "unknown"}\n`);
                }
            }
        }

        writeInteractiveReport(results);
    } finally {
        terminal.close();
    }
}

function createLineReader() {
    const terminal = createInterface({ input, output });
    const queuedLines = [];
    const pendingReads = [];
    let isClosed = false;

    terminal.on("line", (line) => {
        const pendingRead = pendingReads.shift();
        if (pendingRead) {
            pendingRead.resolve(line);
        } else {
            queuedLines.push(line);
        }
    });

    terminal.on("close", () => {
        isClosed = true;
        while (pendingReads.length > 0) {
            pendingReads.shift().resolve(undefined);
        }
    });

    async function readLine() {
        const queuedLine = queuedLines.shift();
        if (queuedLine !== undefined) {
            return queuedLine;
        }

        if (isClosed) {
            return undefined;
        }

        return await new Promise((resolve, reject) => {
            pendingReads.push({ resolve, reject });
        });
    }

    return {
        async question(prompt) {
            output.write(prompt);

            const line = await readLine();
            if (line === undefined) {
                throw new Error("Input closed before interactive exam finished.");
            }

            return line;
        },
        async readLine() {
            return await readLine();
        },
        close() {
            terminal.close();
        },
    };
}

async function readCorpusCaseNames(corpusRoot) {
    const entries = await readdir(corpusRoot, { withFileTypes: true });
    const caseNames = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        try {
            await readFile(join(corpusRoot, entry.name, "input.json"), "utf8");
            await readFile(join(corpusRoot, entry.name, "intent.txt"), "utf8");
            caseNames.push(entry.name);
        } catch {
            // Non-case directories such as safety are intentionally ignored.
        }
    }

    return caseNames.sort((left, right) => left.localeCompare(right));
}

async function askSelectedCases(terminal, caseNames) {
    const answer = (await terminal.question("Select cases (example: 1/2/5/all): ")).trim();
    if (answer.toLowerCase() === "all") {
        return caseNames;
    }

    const indexes = answer
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10));

    if (indexes.length === 0 || indexes.some((index) => !Number.isInteger(index) || index < 1 || index > caseNames.length)) {
        throw new Error("Invalid case selection.");
    }

    return Array.from(new Set(indexes)).map((index) => caseNames[index - 1]);
}

async function askSelectedEngines(terminal) {
    const answer = (await terminal.question("Select engine (jq/jsonata/both): ")).trim().toLowerCase();
    switch (answer) {
        case "jq":
        case "jq-wasm":
            return ["jq-wasm"];
        case "jsonata":
            return ["jsonata"];
        case "both":
            return ["jq-wasm", "jsonata"];
        default:
            throw new Error("Invalid engine selection.");
    }
}

async function askRoundCount(terminal) {
    const answer = (await terminal.question("Rounds per selected case/engine: ")).trim();
    const rounds = Number.parseInt(answer, 10);
    if (!Number.isInteger(rounds) || rounds < 1) {
        throw new Error("Round count must be a positive integer.");
    }

    return rounds;
}

async function askClipboardPreference(terminal) {
    const answer = (await terminal.question("Copy each prompt to clipboard automatically? (y/N): ")).trim().toLowerCase();
    return answer === "y" || answer === "yes";
}

async function readMultilineRule(terminal) {
    const lines = [];

    while (true) {
        const line = await terminal.readLine();
        if (line === undefined) {
            if (lines.length === 0) {
                throw new Error("Input closed before any rule content was pasted.");
            }

            break;
        }

        if (line.trim() === MANUAL_RULE_TERMINATOR) {
            break;
        }

        lines.push(line);
    }

    const transformText = lines.join("\n").trim();
    if (transformText.length === 0) {
        throw new Error("Rule must not be empty.");
    }

    return transformText;
}

function copyTextToClipboard(text) {
    return new Promise((resolve) => {
        const childProcess = spawn("clip.exe", [], {
            stdio: ["pipe", "ignore", "pipe"],
        });

        let stderr = "";

        childProcess.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });

        childProcess.on("error", (error) => {
            resolve({
                ok: false,
                message: toBoundedMessage(error),
            });
        });

        childProcess.on("close", (exitCode) => {
            resolve(exitCode === 0
                ? { ok: true }
                : {
                    ok: false,
                    message: stderr.trim() || `clip.exe exited with code ${exitCode}.`,
                });
        });

        childProcess.stdin.end(text, "utf8");
    });
}

function writeInteractiveReport(results) {
    const successCount = results.filter((result) => result.ok).length;
    output.write("\n=== Aggregate report ===\n");
    output.write(`Total: ${results.length}, pass: ${successCount}, fail: ${results.length - successCount}\n`);

    const buckets = new Map();
    for (const result of results) {
        const key = `${result.caseName} / ${result.engine}`;
        const bucket = buckets.get(key) ?? { total: 0, pass: 0 };
        bucket.total += 1;
        bucket.pass += result.ok ? 1 : 0;
        buckets.set(key, bucket);
    }

    for (const [key, bucket] of buckets.entries()) {
        output.write(`${key}: ${bucket.pass}/${bucket.total}\n`);
    }
}

function buildTransformPrompt(engine, inputText, displayIntent) {
    const engineDescription = engine === "jq-wasm"
        ? "jq-wasm jq 1.8-compatible filter"
        : "JSONata 2.x expression";
    const outputKind = engine === "jq-wasm" ? "jq filter" : "JSONata expression";
    const engineRules = engine === "jq-wasm"
        ? [
            "- This is jq, not JavaScript. Use jq object construction and jq pipes.",
            "- Do not use .[0] unless the input sample itself is a top-level array.",
            "- Check the top-level sample shape first. If it is an object, do not start the filter with .[] as if it were an array.",
            "- Use if .field != null then ... else empty end when zero is a valid value.",
            "- jq string-to-number syntax is (.field | tonumber), not tonumber(.field).",
            "- jq lowercase syntax is (.field | ascii_downcase), not lower(.field) or .field | lower.",
            "- If a numeric field is already a number, do not pipe it through tonumber.",
            "- For JSON keys that contain colons, use bracket syntax like .[\"odpt:railway\"], not .odpt:railway.",
            "- Top-level JSON fields are properties, not variables. Use .field, or bind them explicitly with .field as $field before changing pipeline context.",
            "- For nested trees with Children arrays, use recursive descent such as .. | objects | select(.Text? == \"CPU Package\" and .Type? == \"Power\") instead of guessing a fixed depth.",
        ]
        : [
            "- This is JSONata, not JavaScript. Use JSONata functions such as $number().",
            "- Do not use JavaScript functions such as number(), parseFloat(), or Math.*.",
            "- JSONata string concatenation uses &, not +.",
            "- The expression must return an object like {\"metrics\": [...]}, not a bare array.",
            "- Check the top-level sample shape first. If it is an object, do not start with array-only logic.",
            "- Top-level JSONata paths do not start with a dot. Use usage.primary.value, not .usage.primary.value.",
            "- For arrays, prefer $map(array, function($v) { {...} }).",
            "- In JSONata $map, the function body must return one value. To return an object, wrap the object in braces: function($v) { {\"label\":\"Item\",\"value\":$v.amount,\"unit\":\"unitless\"} }.",
            "- After $filter(...), use $map($filter(...), function($v) { {...} }); do not write $filter(...) {...}.",
            "- Every object entry must be \"key\": value. Do not put a bare expression inside an object. For a label with a dynamic suffix, use \"label\": \"Item \" & $v.name.",
            "- Use paths from the input sample directly, such as stargazers_count, current.temperature_2m, or data.result.",
            "- Do not invent root variables like $input, $root, $data, or $result unless the expression defines them.",
            "- Example: for input {\"count\": 3}, use {\"metrics\":[{\"label\":\"Count\",\"value\":count,\"unit\":\"unitless\"}]}; do not use $input.count or $root.count.",
            "- Example: for input {\"items\":[{\"amount\":\"2\"}]}, use {\"metrics\":$map(items,function($v){{\"label\":\"Item\",\"value\":$number($v.amount),\"unit\":\"unitless\"}})}.",
            "- Top-level JSON fields are properties, not variables. Use trains or occupancyStatusScale, not $trains or $occupancyStatusScale unless those variables are defined in the expression.",
            "- For JSON keys that contain colons, use backtick property access like $v.`odpt:railway`, not $v.odpt:railway or $v[\"odpt:railway\"].",
            "- Do not wrap field paths in JavaScript-style parentheses unless JSONata syntax requires it.",
        ];

    return `/no_think
Convert the input JSON into a small JSON catalog for exactly the data the user asked to display on a Stream Deck key.

Engine: ${engineDescription}

User display request:
${displayIntent}

Input JSON sample:
${inputText}

User display request repeated:
${displayIntent}

Target output JSON schema:
{
  "metrics": [
    {
      "label": "CPU",
      "value": 123.45,
      "unit": "${SUPPORTED_UNITS.join(" | ")}",
      "customUnit": "km/h",
      "maximum": 100
    }
  ]
}

Rules:
- The visible answer must contain only the transform expression.
- Do not include <think>, analysis, explanation, Markdown, or copied input JSON.
- Output exactly one JSON object with a top-level "metrics" array.
- The metrics array must contain at least one metric when the requested data is
  present in the sample.
- Every metric must have label, value, and unit.
- value must be numeric, not a string.
- Do not output metricId. The app assigns metric IDs after this transform.
- label must be 1-12 ASCII characters or 1-6 CJK characters.
- label must be one short noun or abbreviation, for example CPU, GPU, TEMP,
  RAM, NET, DOWN, Stars, ETA, Tokyo.
- Do not include API keys, URLs, secrets, raw response bodies, or comments.
- If a field is missing, omit that metric instead of inventing a value.
- Extract only the data requested by "User display request".
- Prefer 1-4 requested user-facing live/domain values. Do not output every
  numeric field just because it is numeric.
- If the JSON contains many possible entities, filter to the entity, provider,
  direction, location, or sensor named in the user request.
- If the user request is ambiguous, choose the fields that directly match the
  request words and ignore unrelated numeric fields.
- Ignore API/transport metadata such as request time, generation time,
  latitude, longitude, elevation, UTC offset, timestamps, IDs, and version
  numbers unless the input is specifically about that metric.
- Ignore duplicate aliases that report the same concept, such as GitHub
  watchers_count duplicating stargazers_count.
- For known units, use the unit enum.
- If the provider has a real unit that is not in the enum, set unit to
  "custom" and set customUnit to the short provider unit text.
- If the requested value is in minutes, use unit "custom" and customUnit "min".
- If unit is not "custom", omit customUnit.
- maximum is optional. Include maximum only when the source has an obvious
  range or safe display maximum. For percent, use maximum 100.
- Do not emit metrics for string-valued source fields such as names,
  languages, statuses, or descriptions.
${engineRules.join("\n")}

Task:
Write only the ${outputKind}. Do not explain it.`;
}

async function requestTransform(options, prompt) {
    if (options.provider === "ollama") {
        return await requestOllamaTransform(options, prompt);
    }

    return await requestOpenAiCompatibleTransform(options, prompt);
}

async function requestOpenAiCompatibleTransform(options, prompt) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), options.requestTimeoutMs);

    try {
        const response = await fetch(options.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: options.model,
                messages: [
                    {
                        role: "system",
                        content: "Output only the requested transform expression. Do not include visible reasoning, <think> tags, Markdown fences, explanations, or copied input JSON.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0,
                max_tokens: options.maxTokens,
            }),
            signal: abortController.signal,
        });

        if (!response.ok) {
            throw new Error(`Model endpoint returned HTTP ${response.status}.`);
        }

        const body = await response.json();
        const message = body?.choices?.[0]?.message;
        const content = message?.content;
        const reasoning = readReasoningText(message);
        if (typeof content !== "string" || content.trim().length === 0) {
            if (reasoning) {
                return {
                    transformContent: `<think>\n${reasoning}\n</think>`,
                    content: "",
                    reasoning,
                    rawResponse: body,
                };
            }

            throw new Error("Model endpoint returned no message content.");
        }

        return {
            transformContent: content,
            content,
            reasoning,
            rawResponse: body,
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function requestOllamaTransform(options, prompt) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), options.requestTimeoutMs);

    try {
        const response = await fetch(options.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: options.model,
                messages: [
                    {
                        role: "system",
                        content: "Output only the requested transform expression. Do not include visible reasoning, <think> tags, Markdown fences, explanations, or copied input JSON.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                stream: false,
                think: options.ollamaThink,
                options: {
                    temperature: 0,
                    num_predict: options.maxTokens,
                },
            }),
            signal: abortController.signal,
        });

        if (!response.ok) {
            throw new Error(`Ollama endpoint returned HTTP ${response.status}.`);
        }

        const body = await response.json();
        const message = body?.message;
        const content = message?.content;
        const reasoning = readReasoningText(message);
        if (typeof content !== "string" || content.trim().length === 0) {
            if (reasoning) {
                return {
                    transformContent: `<think>\n${reasoning}\n</think>`,
                    content: "",
                    reasoning,
                    rawResponse: body,
                };
            }

            throw new Error("Ollama endpoint returned no message content.");
        }

        return {
            transformContent: content,
            content,
            reasoning,
            rawResponse: body,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function readReasoningText(message) {
    if (!message || typeof message !== "object") {
        return undefined;
    }

    for (const fieldName of ["reasoning", "thinking", "reasoning_content"]) {
        const value = message[fieldName];
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }

    return undefined;
}

function formatModelRawOutput(modelOutput) {
    return JSON.stringify({
        reasoning: modelOutput.reasoning,
        content: modelOutput.content,
        rawResponse: modelOutput.rawResponse,
    }, undefined, 2);
}

function extractTransform(rawContent) {
    if (/<think>/i.test(rawContent) && !/<\/think>/i.test(rawContent)) {
        return rawContent.trim();
    }

    const withoutThinking = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fencedMatch = /```(?:jq|jsonata|json)?\s*([\s\S]*?)```/i.exec(withoutThinking);
    if (fencedMatch) {
        return fencedMatch[1].trim();
    }

    return withoutThinking;
}

function containsThinkingTag(value) {
    return /<\/?think>/i.test(value);
}

function sanitizePathSegment(value) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function runTransformValidation(options) {
    return new Promise((resolve) => {
        const scriptPath = fileURLToPath(new URL("./custom-metric-transform-check.mjs", import.meta.url));
        const childProcess = spawn(process.execPath, [
            scriptPath,
            "--engine",
            options.engine,
            "--input",
            options.inputPath,
            "--transform",
            options.transformPath,
            "--metric-id-policy",
            "assign",
            ...(options.expectedPath
                ? [
                    "--expected",
                    options.expectedPath,
                ]
                : []),
            "--timeout-ms",
            "2000",
        ], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        childProcess.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
        });

        childProcess.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });

        childProcess.on("close", () => {
            try {
                resolve(JSON.parse(stdout));
            } catch {
                resolve({
                    ok: false,
                    stage: "validator",
                    message: stderr.trim() || stdout.trim() || "Validator produced no JSON output.",
                });
            }
        });
    });
}

function parseCommandLine(args) {
    const options = {
        endpoint: DEFAULT_ENDPOINT,
        provider: "ollama",
        model: DEFAULT_MODEL,
        corpusRoot: DEFAULT_CORPUS_ROOT,
        outputRoot: DEFAULT_OUTPUT_ROOT,
        rounds: DEFAULT_ROUNDS,
        requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
        maxTokens: DEFAULT_MAX_TOKENS,
        ollamaThink: false,
        compareExpected: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        switch (arg) {
            case "--case":
                options.caseName = readOptionValue(args, ++index, arg);
                break;
            case "--engine":
                options.engine = readOptionValue(args, ++index, arg);
                break;
            case "--endpoint":
                options.endpoint = readOptionValue(args, ++index, arg);
                break;
            case "--provider":
                options.provider = readOptionValue(args, ++index, arg);
                break;
            case "--model":
                options.model = readOptionValue(args, ++index, arg);
                break;
            case "--corpus-root":
                options.corpusRoot = readOptionValue(args, ++index, arg);
                break;
            case "--output-root":
                options.outputRoot = readOptionValue(args, ++index, arg);
                break;
            case "--ollama-think":
                options.ollamaThink = readOllamaThinkOption(args, ++index, arg);
                break;
            case "--intent":
                options.intentText = readOptionValue(args, ++index, arg);
                break;
            case "--intent-file":
                options.intentPath = readOptionValue(args, ++index, arg);
                break;
            case "--rounds":
                options.rounds = readPositiveIntegerOption(args, ++index, arg);
                break;
            case "--request-timeout-ms":
                options.requestTimeoutMs = readPositiveIntegerOption(args, ++index, arg);
                break;
            case "--max-tokens":
                options.maxTokens = readPositiveIntegerOption(args, ++index, arg);
                break;
            case "--compare-expected":
                options.compareExpected = true;
                break;
            case "--interactive":
                options.interactive = true;
                break;
            case "--help":
            case "-h":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function readOllamaThinkOption(args, index, optionName) {
    const value = readOptionValue(args, index, optionName);
    switch (value) {
        case "true":
            return true;
        case "false":
            return false;
        case "high":
        case "medium":
        case "low":
            return value;
        default:
            throw new Error(`${optionName} must be true, false, high, medium, or low.`);
    }
}

function readOptionValue(args, index, optionName) {
    const value = args[index];
    if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${optionName}.`);
    }

    return value;
}

function readPositiveIntegerOption(args, index, optionName) {
    const value = Number.parseInt(readOptionValue(args, index, optionName), 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${optionName} must be a positive integer.`);
    }

    return value;
}

function writeJson(value) {
    process.stdout.write(`${JSON.stringify(value, undefined, 2)}\n`);
}

function writeProgress(message) {
    process.stderr.write(`[custom-metric-transform-exam] ${message}\n`);
}

function toBoundedMessage(error) {
    const message = error instanceof Error
        ? error.message
        : typeof error === "object"
            ? JSON.stringify(error)
            : String(error);
    return message.length > 300 ? `${message.slice(0, 300)}...` : message;
}

function printUsage() {
    process.stdout.write(`Usage:
node packages/hub/scripts/custom-metric-transform-exam.mjs \\
  --case codexbar \\
  --engine jq-wasm|jsonata \\
  --rounds 5

Interactive manual exam:
node packages/hub/scripts/custom-metric-transform-exam.mjs --interactive

Optional:
  --provider openai-compatible|ollama
  --endpoint http://localhost:11434/api/chat
  --model qwen3.6:latest
  --corpus-root docs/development/runtime-sources/05-custom-metrics/poc-corpus
  --output-root artifacts/custom-metric-poc
  --ollama-think false
  --intent "Display current temperature and wind speed."
  --intent-file docs/development/runtime-sources/05-custom-metrics/poc-corpus/open-meteo/intent.txt
  --request-timeout-ms 120000
  --max-tokens 1536
  --compare-expected
`);
}

