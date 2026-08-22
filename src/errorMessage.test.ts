import { describe, expect, it } from "vitest";
import { errorMessage } from "./errorMessage";

describe("errorMessage", () => {
  it("preserves Error messages", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("preserves Tauri string rejections", () => {
    expect(errorMessage("Public source request failed with HTTP 403.", "fallback"))
      .toBe("Public source request failed with HTTP 403.");
  });

  it("accepts message-bearing objects and falls back otherwise", () => {
    expect(errorMessage({ message: "decoder failed" }, "fallback")).toBe("decoder failed");
    expect(errorMessage({ code: 500 }, "fallback")).toBe("fallback");
  });
});
