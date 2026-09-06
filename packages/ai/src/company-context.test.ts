import {
  companyContextInputSchema,
  type CompanyContextInput,
} from "@miraio/domain";
import { describe, expect, it, vi } from "vitest";

import {
  CompanyContextGeneratorError,
  OpenAICompanyContextGenerator,
} from "./company-context";

const input: CompanyContextInput = companyContextInputSchema.parse({
  company: "Example Company",
  department: "Product",
  locale: "ja",
  title: "Product Lead",
});

const validOutput = {
  company_description: "ビジネス向けのソフトウェアを提供する企業です。",
  industry: "IT・ソフトウェア / IT & Software",
  company_scale: "sme",
  role_scope: "プロダクトの方向性と優先順位に責任を持つ役割です。",
  role_level: "manager",
};

function generatorFor(request: () => Promise<unknown>) {
  return new OpenAICompanyContextGenerator({
    model: "configured-model-alias",
    request,
  });
}

describe("OpenAI Company Context generator", () => {
  it("maps deterministic structured output into canonical company context", async () => {
    const request = vi.fn().mockResolvedValue(validOutput);
    const generator = new OpenAICompanyContextGenerator({
      model: "configured-model-alias",
      request,
    });

    await expect(generator.generate(input)).resolves.toEqual(validOutput);
    expect(request).toHaveBeenCalledWith({
      input,
      model: "configured-model-alias",
    });
  });

  it("accepts null for every optional field when the name gives no signal", async () => {
    const generator = generatorFor(async () => ({
      company_description: null,
      industry: null,
      company_scale: "unknown",
      role_scope: null,
      role_level: "unknown",
    }));

    await expect(generator.generate(input)).resolves.toEqual({
      company_description: null,
      industry: null,
      company_scale: "unknown",
      role_scope: null,
      role_level: "unknown",
    });
  });

  it("fails closed when the provider returns no parsed output", async () => {
    await expect(
      generatorFor(async () => null).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });

    await expect(
      generatorFor(async () => undefined).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("rejects an invented company scale or role level", async () => {
    await expect(
      generatorFor(async () => ({
        ...validOutput,
        company_scale: "multinational",
      })).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });

    await expect(
      generatorFor(async () => ({
        ...validOutput,
        role_level: "founder",
      })).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("rejects fields the schema does not declare", async () => {
    await expect(
      generatorFor(async () => ({
        ...validOutput,
        employee_count: 4200,
      })).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("rejects prose that exceeds the declared field bounds", async () => {
    // The `.max()` bounds are load-bearing for the OpenAI strict-mode wire
    // format, so a regression that removes them must fail here too rather than
    // only in structured-output-schema.test.ts.
    await expect(
      generatorFor(async () => ({
        ...validOutput,
        company_description: "あ".repeat(1001),
      })).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });

    await expect(
      generatorFor(async () => ({
        ...validOutput,
        industry: "あ".repeat(201),
      })).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });

    await expect(
      generatorFor(async () => ({
        ...validOutput,
        role_scope: "あ".repeat(1001),
      })).generate(input),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("maps rate limits without leaking provider error text", async () => {
    const error = await generatorFor(async () => {
      throw { status: 429, message: "provider details" };
    })
      .generate(input)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CompanyContextGeneratorError);
    expect(error).toMatchObject({ code: "rate_limited" });
    expect((error as Error).message).not.toContain("provider details");
  });

  it("maps aborted and timed-out requests to a timeout", async () => {
    const aborted = await generatorFor(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    })
      .generate(input)
      .catch((cause: unknown) => cause);

    expect(aborted).toMatchObject({ code: "timeout" });

    const timedOut = await generatorFor(async () => {
      throw { status: 408 };
    })
      .generate(input)
      .catch((cause: unknown) => cause);

    expect(timedOut).toMatchObject({ code: "timeout" });
  });

  it("maps an unrecognized provider failure without leaking its text", async () => {
    const error = await generatorFor(async () => {
      throw new Error("provider details");
    })
      .generate(input)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CompanyContextGeneratorError);
    expect(error).toMatchObject({ code: "provider_unavailable" });
    expect((error as Error).message).not.toContain("provider details");
  });

  it("requires model configuration and a production API key", () => {
    expect(
      () => new OpenAICompanyContextGenerator({ apiKey: "key", model: " " }),
    ).toThrow(CompanyContextGeneratorError);
    expect(
      () => new OpenAICompanyContextGenerator({ model: "model" }),
    ).toThrow(CompanyContextGeneratorError);
  });
});
