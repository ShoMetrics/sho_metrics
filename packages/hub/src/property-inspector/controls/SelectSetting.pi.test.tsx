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

const navigationOptions = [
    { value: "alpha", label: "Alpha" },
    { value: "beta", label: "Beta", disabled: true },
    { value: "gamma", label: "Gamma" },
    { value: "delta", label: "Delta" },
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

test("custom select keyboard navigation skips disabled options and preserves trigger focus", async () => {
    const selectedValues: string[] = [];
    const user = userEvent.setup();

    render(
        <SelectSetting
            label="Metric"
            value="alpha"
            optionList={navigationOptions}
            onValueChange={(value) => {
                selectedValues.push(value);
            }}
        />,
    );

    const trigger = screen.getByRole("combobox", { name: /metric/i });
    await user.click(trigger);

    const listbox = screen.getByRole("listbox", { name: /metric/i });
    const betaOption = within(listbox).getByRole("option", { name: "Beta" });
    assert.equal(
        betaOption.getAttribute("aria-disabled"),
        "true",
    );

    await user.keyboard("{ArrowDown}");
    const gammaOption = within(listbox).getByRole("option", { name: "Gamma" });
    assert.equal(trigger.getAttribute("aria-activedescendant"), gammaOption.id);

    await user.keyboard("{Escape}");
    assert.equal(screen.queryByRole("listbox"), null);
    assert.deepEqual(selectedValues, []);

    await user.click(trigger);
    const reopenedListbox = screen.getByRole("listbox", { name: /metric/i });

    await user.keyboard("{End}");
    const deltaOption = within(reopenedListbox).getByRole("option", { name: "Delta" });
    assert.equal(trigger.getAttribute("aria-activedescendant"), deltaOption.id);

    await user.keyboard("{Home}");
    const alphaOption = within(reopenedListbox).getByRole("option", { name: "Alpha" });
    assert.equal(trigger.getAttribute("aria-activedescendant"), alphaOption.id);

    await user.keyboard("{End}");
    await user.keyboard("{Enter}");

    assert.deepEqual(selectedValues, ["delta"]);
    assert.equal(screen.queryByRole("listbox"), null);
    assert.equal(document.activeElement, trigger);
});
