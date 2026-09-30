import { describe, expect, it } from "vitest";
import { MOCKFORGE_VERSION } from "../index.js";

describe("@mockforge/core", () => {
  it("exposes the package version", () => {
    expect(MOCKFORGE_VERSION).toBe("0.1.0");
  });

  it("exports the shared contract types module", async () => {
    const mod = await import("../index.js");
    expect(mod.MOCKFORGE_VERSION).toBe(MOCKFORGE_VERSION);
  });
});
