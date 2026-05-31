import { strict as assert } from "node:assert";
import { test } from "node:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectSetting } from "./SelectSetting";
import type { SelectOption } from "../inspector/types";

const metricOptions = [
    { value: "cpu", label: "CPU" },
    { value: "gpu", label: "GPU" },
] satisfies readonly SelectOption[];

test("custom select commits a user-selected option in the DOM", async () => {
    const selectedValues: string[] = [];
    const user = userEvent.setup();

    render(
        <SelectSetting
            label="Metric"
            value="cpu"
            optionList={metricOptions}
            onValueChange={(value) => {
                selectedValues.push(value);
            }}
        />,
    );

    const trigger = screen.getByRole("combobox", { name: /metric/i });
    assert.equal(trigger.getAttribute("aria-expanded"), "false");

    await user.click(trigger);

    const listbox = screen.getByRole("listbox", { name: /metric/i });
    assert.deepEqual(
        within(listbox).getAllByRole("option").map((option) => option.textContent),
        ["CPU", "GPU"],
    );

    await user.click(within(listbox).getByRole("option", { name: "GPU" }));

    assert.deepEqual(selectedValues, ["gpu"]);
    assert.equal(screen.queryByRole("listbox"), null);
});
