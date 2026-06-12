import { formatCustomMetricIconPromptList } from "../../../widgets/icons/custom-metric-icon-search";
import type { SampleState } from "./types";

const SAMPLE_JSON_PROMPT_PLACEHOLDER = "[SAMPLE JSON HERE, DO NOT SEND OUT WITHOUT GIVING SAMPLE]";

export function buildCustomMetricPrompt(options: {
    readonly locale: string;
    readonly userIntent: string;
    readonly sample: SampleState | undefined;
}): string {
    const userIntent = options.userIntent.trim().length === 0
        ? "[DESCRIBE WHAT VALUE TO DISPLAY]"
        : options.userIntent.trim();
    const sampleJson = options.sample?.samplePreview ?? SAMPLE_JSON_PROMPT_PLACEHOLDER;

    return [
        "Write a jq rule that converts the input JSON into exactly one scalar metric for a Stream Deck key, or reject the task and explain what is missing.",
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
        "Target output JSON schema:",
        "{",
        "  \"metric\": {",
        "    \"label\": \"TEMP\",",
        "    \"value\": 23.5,",
        "    \"unit\": \"percent | celsius | fahrenheit | watts | bytes | bytes_per_second | milliseconds | seconds | hertz | revolutions_per_minute | unitless | custom\",",
        "    \"customUnit\": \"km/h\",",
        "    \"maximum\": 100,",
        "    \"suggestedLucideIconId\": \"thermometer\"",
        "  }",
        "}",
        "",
        "Example Lucide icon ids:",
        formatCustomMetricIconPromptList(),
        "",
        "Before writing jq:",
        "- If the user display request is missing, too broad, or does not clearly say which value to display, do not write jq. Ask the user to clarify the exact value they want.",
        "- If Input JSON sample is a placeholder, HTML page, error page, plain text, or otherwise not usable as JSON, do not write jq. Ask the user to provide a valid JSON sample.",
        "- If Input JSON sample looks like a truncated JSON preview but still contains enough field structure to write a safe transform, you may write jq only when you are confident about the requested field path.",
        "- When you ask for a valid JSON sample or a clearer display request, reply with natural language only. Do not include jq, Markdown, code fences, or explanations of the rules.",
        ...(options.locale === "en"
            ? []
            : [`- Reply to clarification or sample-request messages in ${options.locale}.`]),
        "",
        "Jq output rules:",
        "- Write only the jq expression. Do not include Markdown, explanation, or comments.",
        "- Output exactly one JSON object with a top-level metric object.",
        "- Do not output metricId.",
        "- Extract only the value requested by the user display request.",
        "- label must be 1-12 ASCII characters or 1-6 CJK characters.",
        "- value must be numeric.",
        "- Use unit custom plus customUnit only when the provider unit is not in the enum.",
        "- maximum is optional. Include it only for an obvious range such as percent 100.",
        "- suggestedLucideIconId is optional and advisory. Prefer one example id from the list above when it clearly matches the requested metric, or use another valid Lucide icon id when you are confident it exists.",
    ].join("\n");
}
