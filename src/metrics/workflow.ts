import type { components } from "@octokit/openapi-types";
import type { Gauge } from "@opentelemetry/api";
import { getMeter } from "../meter";

// Lazy initialization - gauge created on first use
let leadTimeGauge: Gauge | undefined;

function recordWorkflowMetrics(
  workflowRun: components["schemas"]["workflow-run"],
  prDetails: components["schemas"]["pull-request"] | null
): void {
  // Record lead time metric (DORA: Lead Time for Changes)
  if (prDetails?.created_at) {
    // Lazy-create gauge on first use (after MeterProvider is initialized)
    if (!leadTimeGauge) {
      const meter = getMeter();
      leadTimeGauge = meter.createGauge("github.pull_request.lead_time", {
        unit: "ms",
        description: "PR lead time from creation to workflow completion",
      });
    }

    const prCreatedAt = new Date(prDetails.created_at).getTime();
    const workflowEndAt = new Date(workflowRun.updated_at).getTime();
    const leadTimeMs = workflowEndAt - prCreatedAt;

    leadTimeGauge.record(leadTimeMs, {
      "repository.name": workflowRun.repository.full_name,
      "pull_request.number": prDetails.number,
      "workflow.event": workflowRun.event,
    });
  }
}

export { recordWorkflowMetrics };
