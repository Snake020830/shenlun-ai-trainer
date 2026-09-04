import { describe, expect, it } from "vitest";
import { clampResultDockHeight, resizedResultDockHeight, RESULT_DOCK_MIN_HEIGHT } from "./practiceResultDock";

describe("practice result dock resizing", () => {
  it("grows when the horizontal splitter is dragged upward", () => {
    expect(resizedResultDockHeight(260, 500, 420, 800)).toBe(340);
  });

  it("keeps enough room for both the answer and result areas", () => {
    expect(clampResultDockHeight(20, 800)).toBe(RESULT_DOCK_MIN_HEIGHT);
    expect(clampResultDockHeight(900, 800)).toBe(564);
  });
});
