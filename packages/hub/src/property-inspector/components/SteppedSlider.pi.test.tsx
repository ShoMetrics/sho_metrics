import { strict as assert } from "node:assert";
import { test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SteppedSlider } from "./SteppedSlider";

test("stepped slider reports numeric values from DOM range input changes", () => {
    const selectedValues: number[] = [];

    render(
        <SteppedSlider
            value={0}
            minimum={-10}
            maximum={10}
            lowerLabel="Muted"
            upperLabel="Vivid"
            ariaLabel="Color Strength"
            onValueChange={(value) => {
                selectedValues.push(value);
            }}
        />,
    );

    const slider = screen.getByRole("slider", { name: /color strength/i });

    fireEvent.change(slider, { target: { value: "7" } });

    assert.deepEqual(selectedValues, [7]);
});
