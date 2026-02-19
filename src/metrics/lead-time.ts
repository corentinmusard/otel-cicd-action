interface LeadTimePhaseDurations {
  first_commit_to_pr_created: number;
  pr_created_to_ready_for_review: number;
  ready_for_review_to_approved: number;
  approved_to_merged: number;
  merged_to_deployed: number;
}

type LeadTimePhase = keyof LeadTimePhaseDurations;

const LEAD_TIME_PHASES: LeadTimePhase[] = [
  "first_commit_to_pr_created",
  "pr_created_to_ready_for_review",
  "ready_for_review_to_approved",
  "approved_to_merged",
  "merged_to_deployed",
];

interface LeadTimeDates {
  firstCommitAt: string;
  prCreatedAt: string;
  readyForReviewAt: string | null;
  firstApprovedAt: string | null;
  mergedAt: string;
  deployedAt: string;
}

interface LeadTimeDurations {
  leadTimeMs: number;
  phaseDurations: LeadTimePhaseDurations;
}

function calculateLeadTimeDurations(dates: LeadTimeDates): LeadTimeDurations {
  const readyForReviewAt = dates.readyForReviewAt ?? dates.prCreatedAt;

  // Phase attribution assumptions:
  // - Additivity is required: phase durations must sum to the overall lead time metric.
  // - Missing draft state collapses pr_created_to_ready_for_review to 0.
  // - Missing approval collapses ready_for_review_to_approved to 0.
  // - Remaining pre-merge time is attributed to approved_to_merged to preserve additivity.
  const preMergeMs = durationMs(dates.firstCommitAt, dates.mergedAt);
  const firstCommitToCreatedRawMs = durationMs(dates.firstCommitAt, dates.prCreatedAt);
  const createdToReadyForReviewRawMs = dates.readyForReviewAt
    ? durationMs(dates.prCreatedAt, dates.readyForReviewAt)
    : 0;
  const readyForReviewToApprovedRawMs = dates.firstApprovedAt ? durationMs(readyForReviewAt, dates.firstApprovedAt) : 0;

  let remainingPreMergeMs = preMergeMs;
  const firstCommitToCreatedMs = Math.min(firstCommitToCreatedRawMs, remainingPreMergeMs);
  remainingPreMergeMs -= firstCommitToCreatedMs;
  const createdToReadyForReviewMs = Math.min(createdToReadyForReviewRawMs, remainingPreMergeMs);
  remainingPreMergeMs -= createdToReadyForReviewMs;
  const readyForReviewToApprovedMs = Math.min(readyForReviewToApprovedRawMs, remainingPreMergeMs);
  remainingPreMergeMs -= readyForReviewToApprovedMs;

  return {
    leadTimeMs: durationMs(dates.firstCommitAt, dates.deployedAt),
    phaseDurations: {
      first_commit_to_pr_created: firstCommitToCreatedMs,
      pr_created_to_ready_for_review: createdToReadyForReviewMs,
      ready_for_review_to_approved: readyForReviewToApprovedMs,
      approved_to_merged: remainingPreMergeMs,
      merged_to_deployed: durationMs(dates.mergedAt, dates.deployedAt),
    },
  };
}

function getLeadTimePhaseDurations(durations: LeadTimeDurations): Array<{ phase: LeadTimePhase; value: number }> {
  return LEAD_TIME_PHASES.map((phase) => ({
    phase,
    value: durations.phaseDurations[phase],
  }));
}

function durationMs(startAt: string, endAt: string): number {
  return Math.max(0, new Date(endAt).getTime() - new Date(startAt).getTime());
}

export { calculateLeadTimeDurations, getLeadTimePhaseDurations, LEAD_TIME_PHASES };
export type { LeadTimeDates, LeadTimeDurations, LeadTimePhase, LeadTimePhaseDurations };
