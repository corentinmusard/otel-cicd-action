import { jest } from "@jest/globals";
import type { components } from "@octokit/openapi-types";
import type { PullRequestData } from "../github";

const recordLeadTime = jest.fn();
const recordLeadTimePhase = jest.fn();

jest.unstable_mockModule("./meters", () => ({
  getLeadTimeGauge: () => ({
    record: recordLeadTime,
  }),
  getLeadTimePhaseGauge: () => ({
    record: recordLeadTimePhase,
  }),
}));

const { recordWorkflowMetrics } = await import("./workflow");

describe("recordWorkflowMetrics", () => {
  beforeEach(() => {
    recordLeadTime.mockReset();
    recordLeadTimePhase.mockReset();
  });

  it("records lead time when data is present", () => {
    const workflowRun = {
      updated_at: "2026-02-10T00:00:10Z",
      event: "pull_request",
      conclusion: "success",
      repository: { full_name: "octo/repo" },
    } as components["schemas"]["workflow-run"];
    const prData: PullRequestData = {
      details: {
        number: 42,
        created_at: "2026-02-10T00:00:01Z",
        merged_at: "2026-02-10T00:00:07Z",
      } as components["schemas"]["pull-request"],
      firstCommitAuthorDate: "2026-02-10T00:00:00Z",
      readyForReviewAt: "2026-02-10T00:00:02Z",
      firstApprovedAt: "2026-02-10T00:00:05Z",
      labels: [],
    };

    recordWorkflowMetrics(workflowRun, prData);

    expect(recordLeadTime).toHaveBeenCalledTimes(1);
    expect(recordLeadTime).toHaveBeenCalledWith(10_000, {
      "repository.name": "octo/repo",
      "pull_request.number": 42,
      "workflow.event": "pull_request",
    });

    expect(recordLeadTimePhase).toHaveBeenCalledTimes(5);
    expect(recordLeadTimePhase).toHaveBeenNthCalledWith(1, 1000, {
      "repository.name": "octo/repo",
      "pull_request.number": 42,
      "workflow.event": "pull_request",
      "lead_time.phase": "first_commit_to_pr_created",
    });
    expect(recordLeadTimePhase).toHaveBeenNthCalledWith(2, 1000, {
      "repository.name": "octo/repo",
      "pull_request.number": 42,
      "workflow.event": "pull_request",
      "lead_time.phase": "pr_created_to_ready_for_review",
    });
    expect(recordLeadTimePhase).toHaveBeenNthCalledWith(3, 3000, {
      "repository.name": "octo/repo",
      "pull_request.number": 42,
      "workflow.event": "pull_request",
      "lead_time.phase": "ready_for_review_to_approved",
    });
    expect(recordLeadTimePhase).toHaveBeenNthCalledWith(4, 2000, {
      "repository.name": "octo/repo",
      "pull_request.number": 42,
      "workflow.event": "pull_request",
      "lead_time.phase": "approved_to_merged",
    });
    expect(recordLeadTimePhase).toHaveBeenNthCalledWith(5, 3000, {
      "repository.name": "octo/repo",
      "pull_request.number": 42,
      "workflow.event": "pull_request",
      "lead_time.phase": "merged_to_deployed",
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
      {
        labels: [],
        details: { number: 42, merged_at: null } as components["schemas"]["pull-request"],
        firstCommitAuthorDate: "2026-02-10T00:00:00Z",
        firstApprovedAt: null,
        readyForReviewAt: null,
      }
    );

    expect(recordLeadTime).not.toHaveBeenCalled();
    expect(recordLeadTimePhase).not.toHaveBeenCalled();
  });
});
