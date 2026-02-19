import * as core from "@actions/core";
import type { components } from "@octokit/openapi-types";
import type { Attributes } from "@opentelemetry/api";
import type { PullRequestData } from "../github";
import { calculateLeadTimeDurations, getLeadTimePhaseDurations } from "./lead-time";
import { getLeadTimeGauge, getLeadTimePhaseGauge } from "./meters";

function recordWorkflowMetrics(workflowRun: components["schemas"]["workflow-run"], pr: PullRequestData): void {
  if (!pr.details?.merged_at) {
    const prDetailsState = pr.details ? "present" : "null";
    const mergedAt = pr.details?.merged_at ?? "null";
    core.info(`Skipping lead time metric: PR not merged (prDetails=${prDetailsState}, merged_at=${mergedAt})`);
    return;
  }

  if (!pr.firstCommitAuthorDate) {
    core.info("Skipping lead time metric: no first commit author date");
    return;
  }

  core.info(`Recording lead time metrics for PR #${pr.details.number}`);

  const durations = calculateLeadTimeDurations({
    firstCommitAt: pr.firstCommitAuthorDate,
    prCreatedAt: pr.details.created_at,
    readyForReviewAt: pr.readyForReviewAt,
    firstApprovedAt: pr.firstApprovedAt,
    mergedAt: pr.details.merged_at,
    deployedAt: workflowRun.updated_at,
  });
  const metricAttributes: Attributes = {
    "repository.name": workflowRun.repository.full_name,
    "pull_request.number": pr.details.number,
    "workflow.event": workflowRun.event,
  };

  getLeadTimeGauge().record(durations.leadTimeMs, metricAttributes);

  for (const { phase, value } of getLeadTimePhaseDurations(durations)) {
    getLeadTimePhaseGauge().record(value, {
      ...metricAttributes,
      "lead_time.phase": phase,
    });
  }
}

export { recordWorkflowMetrics };
