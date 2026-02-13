import { jest } from "@jest/globals";
import type { components } from "@octokit/openapi-types";

const record = jest.fn();

jest.unstable_mockModule("./meters", () => ({
  getLeadTimeGauge: () => ({
    record,
  }),
}));

const { recordWorkflowMetrics } = await import("./workflow");

describe("recordWorkflowMetrics", () => {
  beforeEach(() => {
    record.mockReset();
  });

  it("records lead time when data is present", () => {
    const workflowRun = {
      updated_at: "2026-02-10T00:00:10Z",
      event: "pull_request",
      conclusion: "success",
      repository: { full_name: "octo/repo" },
    } as components["schemas"]["workflow-run"];
    const prDetails = { number: 42, merged_at: "2026-02-10T00:00:05Z" } as components["schemas"]["pull-request"];

    recordWorkflowMetrics(workflowRun, prDetails, "2026-02-10T00:00:00Z");

    expect(record).toHaveBeenCalledWith(10_000, {
      "repository.name": "octo/repo",
      "pull_request.number": 42,
      "workflow.event": "pull_request",
    });
  });

  it("skips when PR is not merged", () => {
    recordWorkflowMetrics(
      {
        updated_at: "2026-02-10T00:00:10Z",
        event: "pull_request",
        conclusion: "success",
        repository: { full_name: "octo/repo" },
      } as components["schemas"]["workflow-run"],
      { number: 42, merged_at: null } as components["schemas"]["pull-request"],
      "2026-02-10T00:00:00Z"
    );

    expect(record).not.toHaveBeenCalled();
  });
});
