import { CUSTOM_HTTP_PROMPT_UNIT_NAMES } from "../../../runtime/sources/custom-http/custom-http-output-schema";
import type { SampleState } from "./types";

const SAMPLE_JSON_PROMPT_PLACEHOLDER = "[SAMPLE JSON HERE, DO NOT SEND OUT WITHOUT GIVING SAMPLE]";
const SOURCE_URL_PROMPT_PLACEHOLDER = "[SOURCE URL NOT PROVIDED]";
const SECRET_QUERY_PARAMETER_NAME_PATTERN =
    /(?:api[_-]?key|access[_-]?token|token|auth|authorization|secret|password|passwd|pwd|signature|sig|client[_-]?secret)/i;
const TARGET_OUTPUT_JSON_SCHEMA_PROMPT = formatJsonPromptBlock(`{
  "metric": {
    "label": "TEMP",
    "value": 23.5,
    "unit": "${CUSTOM_HTTP_PROMPT_UNIT_NAMES.join(" | ")}",
    "customUnit": "km/h",
    "maximum": 100,
    "suggestedLucideIconId": "thermometer"
  }
}`);

function formatJsonPromptBlock(jsonText: string): string {
    return `\`\`\`json
${jsonText}
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
    const sampleJson = formatJsonPromptBlock(options.sample?.samplePreview ?? SAMPLE_JSON_PROMPT_PLACEHOLDER);

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
        "Input JSON sample:",
        sampleJson,
        ...(options.sample?.isSamplePreviewTruncated === true
            ? [
                "",
                "Sample note:",
                `The sample above is a truncated preview of a ${options.sample.responseBytes}-byte response. It may not be complete valid JSON.`,
                "If the requested field is missing or the object structure is unclear, ask the user for a smaller or more focused valid JSON sample instead of guessing.",
            ]
            : []),
        "",
        "Before writing jq, follow this decision order:",
        "1. If the source URL warning says the URL contains secret-like query parameters, warn the user that secrets in URLs may be unsafe and may need rotation if shared externally. This warning alone does not prevent writing jq unless the redacted URL value makes the JSON problem impossible to diagnose.",
        "2. If the user display request is missing, too broad, or does not clearly say which one value to display, do not write jq. Ask the user to clarify the exact value they want.",
        "3. If the input sample is a placeholder, HTML page, error page, plain text, or otherwise not valid JSON, do not write jq. Use the source URL and sample text to explain the likely problem and ask for a valid JSON sample.",
        "4. If the input sample is marked truncated or appears incomplete, write jq only when the requested field path and surrounding structure are visible enough to be safe. Otherwise ask for a smaller or more focused valid JSON sample.",
        "5. If the input sample is valid JSON but does not contain enough information for the display request, or contradicts the display request, do not invent fields or values. Ask the user to clarify the request or provide a different sample. If you can confidently suggest how to correct the URL, do so.",
        "6. If any rule above prevents a safe jq filter, reply with natural language only. Explain the next concrete step for the user. Do not include jq, Markdown, code fences, or explanations of these rules.",
        "7. Otherwise, write only the jq filter now.",
        ...(options.locale === "en"
            ? []
            : [`8. Reply to clarification or sample-request messages in ${options.locale}.`]),
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

    try {
        const parsedSourceUrl = new URL(trimmedSourceUrl);
        let hasSecretLikeQueryParameter = false;
        for (const queryParameterName of Array.from(parsedSourceUrl.searchParams.keys())) {
            if (SECRET_QUERY_PARAMETER_NAME_PATTERN.test(queryParameterName)) {
                hasSecretLikeQueryParameter = true;
                parsedSourceUrl.searchParams.set(queryParameterName, "REDACTED");
            }
        }

        return {
            text: parsedSourceUrl.toString(),
            hasSecretLikeQueryParameter,
        };
    } catch {
        let hasSecretLikeQueryParameter = false;
        const text = trimmedSourceUrl.replace(
            /([?&][^=&#]*(?:api[_-]?key|access[_-]?token|token|auth|authorization|secret|password|passwd|pwd|signature|sig|client[_-]?secret)[^=&#]*=)[^&#]*/gi,
            (_match, queryParameterPrefix: string) => {
                hasSecretLikeQueryParameter = true;
                return `${queryParameterPrefix}REDACTED`;
            },
        );
        return { text, hasSecretLikeQueryParameter };
    }
}
