import { describe, expect, it } from "vitest";

import * as publicAiApi from "./index";

describe("public AI package", () => {
  it("keeps the deferred Jev adapter out of the production entry point", () => {
    expect(publicAiApi).not.toHaveProperty("JevDecisionEvaluator");
  });
});
