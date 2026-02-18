import * as core from "@actions/core";
import type { components } from "@octokit/openapi-types";
import { getLeadTimeGauge } from "./meters";

function recordWorkflowMetrics(
  workflowRun: components["schemas"]["workflow-run"],
  prDetails: components["schemas"]["pull-request"] | null,
  firstCommitAuthorDate: string | null
): void {
  // Record lead time metric (DORA: Lead Time for Changes)
  if (workflowRun.conclusion !== "success") {
    core.info(`Skipping lead time metric: workflow conclusion is ${workflowRun.conclusion}, not success`);
    return;
  }

  if (!prDetails?.merged_at) {
    core.info(
      `Skipping lead time metric: PR not merged (prDetails=${prDetails ? "present" : "null"}, merged_at=${prDetails?.merged_at ?? "null"})`
    );
    return;
  }

  if (!firstCommitAuthorDate) {
    core.info("Skipping lead time metric: no first commit author date");
    return;
  }

  const firstCommitAt = new Date(firstCommitAuthorDate).getTime();
  const workflowEndAt = new Date(workflowRun.updated_at).getTime();
  const leadTimeMs = workflowEndAt - firstCommitAt;

  core.info(`Recording lead time metric: ${leadTimeMs}ms for PR #${prDetails.number}`);
  getLeadTimeGauge().record(leadTimeMs, {
    "repository.name": workflowRun.repository.full_name,
    "pull_request.number": prDetails.number,
    "workflow.event": workflowRun.event,
  });
}

export { recordWorkflowMetrics };
