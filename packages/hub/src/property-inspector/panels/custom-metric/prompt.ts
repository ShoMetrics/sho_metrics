import { CUSTOM_HTTP_PROMPT_UNIT_NAMES } from "../../../runtime/sources/custom-http/custom-http-output-schema";
import { redactSecretLikeSourceUrl } from "../../../runtime/sources/custom-http/custom-http-redaction";
import type { SampleState } from "./types";

const SAMPLE_JSON_PROMPT_PLACEHOLDER = "[SAMPLE JSON HERE, DO NOT SEND OUT WITHOUT GIVING SAMPLE]";
const SOURCE_URL_PROMPT_PLACEHOLDER = "[SOURCE URL NOT PROVIDED]";
const TARGET_OUTPUT_JSON_SCHEMA_PROMPT = formatPromptBlock("json", `{
  "metric": {
    "label": "TEMP",
    "value": 23.5,
    "unit": "${CUSTOM_HTTP_PROMPT_UNIT_NAMES.join(" | ")}",
    "customUnit": "km/h",
    "maximum": 100,
    "suggestedLucideIconId": "thermometer"
  }
}`);

type PromptBlockType = "json" | "text";

function formatPromptBlock(blockType: PromptBlockType, text: string): string {
    return `\`\`\`${blockType}
${text}
\`\`\``;
}

interface PromptSourceUrl {
    readonly text: string;
    readonly hasSecretLikeQueryParameter: boolean;
}

export function buildCustomMetricPrompt(options: {
    readonly locale: string;
    readonly sourceUrl: string;
    readonly userIntent: string;
    readonly sample: SampleState | undefined;
}): string {
    const userIntent = options.userIntent.trim().length === 0
        ? "[DESCRIBE WHAT VALUE TO DISPLAY]"
        : options.userIntent.trim();
    const sourceUrl = readPromptSourceUrl(options.sourceUrl);
    const samplePromptParts = buildPromptSampleParts(options.sample);

    return [
        "Write a jq filter that converts the fetched HTTP JSON into exactly one scalar metric for a Stream Deck key, or reject the task and explain what is missing.",
        "Context: the user entered the source URL in Stream Deck, Stream Deck fetched the JSON sample below, and the user copied this prompt to you so you can write the jq transform rule.",
        "",
        "Source URL for debugging (secret-like query values may be redacted):",
        sourceUrl.text,
        ...(sourceUrl.hasSecretLikeQueryParameter
            ? [
                "",
                "Source URL warning:",
                "The source URL contains secret-like query parameters. Their values were redacted from this prompt.",
            ]
            : []),
        "",
        "User display request:",
        userIntent,
        "",
        ...samplePromptParts.section,
        "",
        "Before writing jq, follow this decision order:",
        ...formatNumberedPromptRules([
            "If the source URL warning says the URL contains secret-like query parameters, warn the user that secrets in URLs may be unsafe and may need rotation if shared externally. This warning alone does not prevent writing jq unless the redacted URL value makes the JSON problem impossible to diagnose.",
            "If the user display request is missing, too broad, or does not clearly say which one value to display, do not write jq. Ask the user to clarify the exact value they want.",
            ...samplePromptParts.decisionRules,
            "If any rule above prevents a safe final metric jq filter, reply with natural language only. Explain the next concrete step for the user. Do not include Markdown, code fences, or explanations of these rules.",
            "Otherwise, write only the jq filter now.",
            ...(options.locale === "en"
                ? []
                : [`Reply to clarification or sample-request messages in ${options.locale}.`]),
        ]),
        "",
        "Target output JSON schema:",
        TARGET_OUTPUT_JSON_SCHEMA_PROMPT,
        "",
        "Jq output rules:",
        "- Write only the jq expression. Do not include Markdown, explanation, or comments.",
        "- Output exactly one JSON object with a top-level metric object.",
        "- Do not output metricId.",
        "- Do not copy source URLs, API keys, secrets, raw response bodies, or comments into the jq output.",
        "- Extract only the value requested by the user display request.",
        "- label must be 1-12 ASCII characters or 1-6 CJK characters.",
        "- value must be numeric.",
        "- Use unit custom plus customUnit only when the provider unit is not in the enum.",
        "- maximum is encouraged but not required. Include a sensible display maximum when the metric has a clear bounded range or scale, such as percent 100, battery 100, or a maximum scale value present in the JSON. Omit maximum when no safe display maximum can be inferred.",
        "- suggestedLucideIconId is encouraged but not required. Choose a valid Lucide icon id when a good match is obvious. If you can browse, use https://lucide.dev/icons/ to confirm the id. If no good icon is obvious, omit suggestedLucideIconId.",
        "",
        "Jq syntax reminders:",
        "- Check whether the sample is an object or array before using `.[]`.",
        "- For keys containing ':' or other special characters, use bracket access like .[\"key:name\"].",
        "- Convert numeric strings with `tonumber` when needed.",
    ].join("\n");
}

function readPromptSourceUrl(sourceUrl: string): PromptSourceUrl {
    const trimmedSourceUrl = sourceUrl.trim();
    if (trimmedSourceUrl.length === 0) {
        return {
            text: SOURCE_URL_PROMPT_PLACEHOLDER,
            hasSecretLikeQueryParameter: false,
        };
    }

    return redactSecretLikeSourceUrl(trimmedSourceUrl);
}

interface PromptSampleParts {
    readonly section: readonly string[];
    readonly decisionRules: readonly string[];
}

function formatNumberedPromptRules(rules: readonly string[]): readonly string[] {
    return rules.map((rule, index) => `${index + 1}. ${rule}`);
}

function buildPromptSampleParts(sample: SampleState | undefined): PromptSampleParts {
    if (sample === undefined) {
        return {
            section: [
                "Input JSON sample:",
                formatPromptBlock("json", SAMPLE_JSON_PROMPT_PLACEHOLDER),
            ],
            decisionRules: [
                "The input sample is a placeholder. Do not write jq. Ask the user to fetch a valid JSON sample first.",
                "If the source URL or user request is enough to diagnose why no sample is available, explain the likely issue.",
                "Do not invent fields, paths, values, units, or icons without a fetched JSON sample.",
                "If a jq exploration query would help, wait until the user provides a fetched sample before suggesting it.",
            ],
        };
    }

    const promptSample = sample.promptSample;
    if (promptSample.kind === "jsonSample") {
        return {
            section: [
                "Input JSON sample:",
                formatPromptBlock("json", promptSample.text),
            ],
            decisionRules: [
                "The input sample is the fetched JSON sample. Use it directly.",
                "If the JSON sample does not contain enough information for the display request, or contradicts the display request, do not invent fields or values. Ask the user to clarify the request or provide a different sample.",
                "If a jq exploration query can reveal a missing path, provide exactly one jq query for the user to run in Stream Deck and ask them to copy the result shown by Stream Deck back to you.",
                "If you can confidently suggest how to correct the URL, do so.",
            ],
        };
    }

    if (promptSample.kind === "jsonDigest" || promptSample.kind === "truncatedJsonDigest") {
        const isTruncatedJsonDigest = promptSample.kind === "truncatedJsonDigest";
        return {
            section: [
                `Input JSON digest for a large ${sample.responseBytes}-byte response:`,
                formatPromptBlock(isTruncatedJsonDigest ? "text" : "json", promptSample.text),
                "",
                "Digest note:",
                "This is an intentional structure summary, not the full response. The digest block contains only real source keys and representative values. Arrays are sampled; use the section below for full-response array lengths.",
                ...(isTruncatedJsonDigest
                    ? [
                        "The digest text itself was capped to keep this prompt bounded. Use jq exploration if the requested path is not visible.",
                    ]
                    : []),
                ...readOptionalSummarySection("Array lengths:", promptSample.arraySummaries),
            ],
            decisionRules: [
                "The input is a JSON digest generated by Stream Deck from the fetched response. Treat it as an intentional structure summary of a large response.",
                "Arrays in the digest are sampled, but visible keys and paths are real. Use the array length section to understand where large arrays were shortened. Do not reject solely because the digest is incomplete.",
                "If the digest does not expose the requested item or path, do not guess. Provide exactly one jq exploration query for the user to run in Stream Deck and ask them to copy the result shown by Stream Deck back to you.",
                "If the digest contains enough structure for the requested metric, write the final metric jq filter.",
            ],
        };
    }

    return {
        section: [
            "Input response preview:",
            formatPromptBlock("text", promptSample.text),
            ...(promptSample.hasTruncatedInvalidJsonPreview
                ? [
                    "",
                    "Sample note:",
                    `The preview above is a truncated preview of a ${sample.responseBytes}-byte response. It may not be complete valid JSON.`,
                ]
                : []),
        ],
        decisionRules: [
            "The input is a raw response preview, not a valid JSON sample. Do not write jq.",
            "Use the source URL and response preview to explain the likely problem and ask the user for a valid JSON sample.",
            "If the response preview is an API error, summarize the error and suggest the next concrete step.",
            "Do not invent fields, paths, values, units, icons, or jq exploration queries from a raw non-JSON preview.",
        ],
    };
}

function readOptionalSummarySection(title: string, summaries: readonly string[]): readonly string[] {
    return summaries.length === 0
        ? []
        : [
            "",
            title,
            ...summaries.map(summary => `- ${summary}`),
        ];
}
