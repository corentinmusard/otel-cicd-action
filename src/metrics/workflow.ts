import type { components } from "@octokit/openapi-types";
import { getLeadTimeGauge } from "./meters";

function recordWorkflowMetrics(
  workflowRun: components["schemas"]["workflow-run"],
  prDetails: components["schemas"]["pull-request"] | null,
  firstCommitAuthorDate: string | null
): void {
  // Record lead time metric (DORA: Lead Time for Changes)
  if (workflowRun.conclusion !== "success") {
    return;
  }

  if (!prDetails?.merged_at) {
    return;
  }

  if (!firstCommitAuthorDate) {
    return;
  }

  const firstCommitAt = new Date(firstCommitAuthorDate).getTime();
  const workflowEndAt = new Date(workflowRun.updated_at).getTime();
  const leadTimeMs = workflowEndAt - firstCommitAt;

  getLeadTimeGauge().record(leadTimeMs, {
    "repository.name": workflowRun.repository.full_name,
    "pull_request.number": prDetails.number,
    "workflow.event": workflowRun.event,
  });
}

export { recordWorkflowMetrics };
