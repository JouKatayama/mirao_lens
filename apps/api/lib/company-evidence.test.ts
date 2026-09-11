import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  processCompanyEvidence,
  type CompanyEvidenceProcessorDependencies,
} from "./company-evidence";

const scanId = "00000000-0000-4013-8000-000000000801";
const userId = "00000000-0000-4013-8000-000000000001";
const accessToken = "valid-token";

describe("processCompanyEvidence", () => {
  const repository = {
    createCompanyContextEvidence: vi.fn(),
    createCompanyWebEvidence: vi.fn(),
  };
  let dependencies: CompanyEvidenceProcessorDependencies;

  beforeEach(() => {
    vi.resetAllMocks();
    repository.createCompanyContextEvidence.mockResolvedValue("evidence-id");
    repository.createCompanyWebEvidence.mockResolvedValue(2);
    dependencies = {
      authenticate: vi.fn().mockResolvedValue({ repository, userId }),
    };
  });

  it("records the inference row and the researched pages", async () => {
    await expect(
      processCompanyEvidence({ accessToken, scanId }, dependencies),
    ).resolves.toEqual({ status: "completed" });

    expect(repository.createCompanyContextEvidence).toHaveBeenCalledWith(
      scanId,
      userId,
    );
    expect(repository.createCompanyWebEvidence).toHaveBeenCalledWith(
      scanId,
      userId,
    );
  });

  it("skips without a session rather than failing the scan", async () => {
    vi.mocked(dependencies.authenticate).mockResolvedValue(null);

    await expect(
      processCompanyEvidence({ accessToken, scanId }, dependencies),
    ).resolves.toEqual({ status: "skipped" });
    expect(repository.createCompanyWebEvidence).not.toHaveBeenCalled();
  });

  it("skips when authentication itself throws", async () => {
    vi.mocked(dependencies.authenticate).mockRejectedValue(new Error("down"));

    await expect(
      processCompanyEvidence({ accessToken, scanId }, dependencies),
    ).resolves.toEqual({ status: "skipped" });
  });

  it("reports a failed sweep without throwing into the pipeline", async () => {
    repository.createCompanyWebEvidence.mockRejectedValue(new Error("db"));

    await expect(
      processCompanyEvidence({ accessToken, scanId }, dependencies),
    ).resolves.toEqual({ status: "failed" });
  });
});
