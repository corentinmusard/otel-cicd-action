import type { components } from "@octokit/openapi-types";
import { getLeadTimeGauge } from "./meters";

function recordWorkflowMetrics(
  workflowRun: components["schemas"]["workflow-run"],
  prDetails: components["schemas"]["pull-request"] | null
): void {
  // Record lead time metric (DORA: Lead Time for Changes)
  if (prDetails?.created_at) {
    const prCreatedAt = new Date(prDetails.created_at).getTime();
    const workflowEndAt = new Date(workflowRun.updated_at).getTime();
    const leadTimeMs = workflowEndAt - prCreatedAt;

    getLeadTimeGauge().record(leadTimeMs, {
      "repository.name": workflowRun.repository.full_name,
      "pull_request.number": prDetails.number,
      "workflow.event": workflowRun.event,
    });
  }
}

export { recordWorkflowMetrics };
