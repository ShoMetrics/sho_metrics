import { strict as assert } from "node:assert";
import { test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { readPropertyInspectorDiagnosticMessage } from "./diagnostic-messages";
import { PropertyInspectorErrorBoundary } from "./diagnostics";
import { TestPropertyInspectorClient } from "./testing/test-property-inspector-client";

test("property inspector error boundary reports redacted render failures", async () => {
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
        render(
            <PropertyInspectorErrorBoundary client={client}>
                <ThrowingPropertyInspectorPanel />
            </PropertyInspectorErrorBoundary>,
        );

        await waitFor(() => {
            const diagnosticMessage = readPropertyInspectorDiagnosticMessage(client.sentMessages[0]?.payload);

            assert.equal(client.sentMessages[0]?.event, "sendToPlugin");
            assert.equal(diagnosticMessage?.level, "error");
            assert.match(diagnosticMessage?.message ?? "", /reactErrorBoundary/u);
            assert.match(diagnosticMessage?.message ?? "", /\[url-redacted\]/u);
            assert.match(diagnosticMessage?.message ?? "", /\[user-path\]/u);
            assert.doesNotMatch(diagnosticMessage?.message ?? "", /secret-token/u);
            assert.doesNotMatch(diagnosticMessage?.message ?? "", /alice/u);
            assert.doesNotMatch(diagnosticMessage?.message ?? "", /bob/u);
            assert.doesNotMatch(diagnosticMessage?.message ?? "", /carol/u);
        });
    } finally {
        consoleErrorSpy.mockRestore();
    }
});

function ThrowingPropertyInspectorPanel(): React.JSX.Element {
    throw new Error(
        "Failed to render https://example.test/?token=secret-token from "
        + "C:\\Users\\alice\\secret.txt /Users/bob/secret.txt /home/carol/secret.txt",
    );
}
