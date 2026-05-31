import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberSetting } from "./NumberSetting";

test("optional number setting writes undefined for an empty value and restores the prop value on blur", async () => {
    const selectedValues: Array<number | undefined> = [];
    const user = userEvent.setup();

    render(
        <NumberSetting
            label="Max Power"
            value={42}
            optional
            onValueChange={(value) => {
                selectedValues.push(value);
            }}
        />,
    );

    const input = screen.getByRole("spinbutton", { name: /max power/i });
    assert.ok(input instanceof HTMLInputElement);

    await user.clear(input);

    assert.deepEqual(selectedValues, [undefined]);
    assert.equal(input.value, "");

    fireEvent.blur(input);

    assert.equal(input.value, "42");
});
