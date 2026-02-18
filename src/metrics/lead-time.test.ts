import { calculateLeadTimeDurations } from "./lead-time";

describe("calculateLeadTimeDurations", () => {
  it("calculates all phases when all events are present", () => {
    const durations = calculateLeadTimeDurations({
      firstCommitAt: "2026-02-10T00:00:00Z",
      prCreatedAt: "2026-02-10T00:00:01Z",
      readyForReviewAt: "2026-02-10T00:00:02Z",
      firstApprovedAt: "2026-02-10T00:00:05Z",
      mergedAt: "2026-02-10T00:00:07Z",
      deployedAt: "2026-02-10T00:00:10Z",
    });

    expect(durations).toEqual({
      leadTimeMs: 10_000,
      phaseDurations: {
        first_commit_to_pr_created: 1000,
        pr_created_to_ready_for_review: 1000,
        ready_for_review_to_approved: 3000,
        approved_to_merged: 2000,
        merged_to_deployed: 3000,
      },
    });
  });

  it("keeps additivity when draft and approval are missing", () => {
    const durations = calculateLeadTimeDurations({
      firstCommitAt: "2026-02-10T00:00:00Z",
      prCreatedAt: "2026-02-10T00:00:01Z",
      readyForReviewAt: null,
      firstApprovedAt: null,
      mergedAt: "2026-02-10T00:00:07Z",
      deployedAt: "2026-02-10T00:00:10Z",
    });

    expect(durations.phaseDurations.pr_created_to_ready_for_review).toBe(0);
    expect(durations.phaseDurations.ready_for_review_to_approved).toBe(0);

    const phaseTotal = Object.values(durations.phaseDurations).reduce((sum, value) => sum + value, 0);
    expect(phaseTotal).toBe(durations.leadTimeMs);
  });

  it("keeps additivity when draft state is missing", () => {
    const durations = calculateLeadTimeDurations({
      firstCommitAt: "2026-02-10T00:00:00Z",
      prCreatedAt: "2026-02-10T00:00:01Z",
      readyForReviewAt: null,
      firstApprovedAt: "2026-02-10T00:00:05Z",
      mergedAt: "2026-02-10T00:00:07Z",
      deployedAt: "2026-02-10T00:00:10Z",
    });

    expect(durations.phaseDurations.pr_created_to_ready_for_review).toBe(0);
    expect(durations.phaseDurations.ready_for_review_to_approved).toBe(4000);

    const phaseTotal = Object.values(durations.phaseDurations).reduce((sum, value) => sum + value, 0);
    expect(phaseTotal).toBe(durations.leadTimeMs);
  });

  it("keeps additivity when approval is missing", () => {
    const durations = calculateLeadTimeDurations({
      firstCommitAt: "2026-02-10T00:00:00Z",
      prCreatedAt: "2026-02-10T00:00:01Z",
      readyForReviewAt: "2026-02-10T00:00:02Z",
      firstApprovedAt: null,
      mergedAt: "2026-02-10T00:00:07Z",
      deployedAt: "2026-02-10T00:00:10Z",
    });

    expect(durations.phaseDurations.ready_for_review_to_approved).toBe(0);
    expect(durations.phaseDurations.approved_to_merged).toBe(5000);

    const phaseTotal = Object.values(durations.phaseDurations).reduce((sum, value) => sum + value, 0);
    expect(phaseTotal).toBe(durations.leadTimeMs);
  });

  it("preserves additivity for out-of-order timestamps", () => {
    const durations = calculateLeadTimeDurations({
      firstCommitAt: "2026-02-10T00:00:00Z",
      prCreatedAt: "2026-02-10T00:00:06Z",
      readyForReviewAt: "2026-02-10T00:00:03Z",
      firstApprovedAt: "2026-02-10T00:00:04Z",
      mergedAt: "2026-02-10T00:00:05Z",
      deployedAt: "2026-02-10T00:00:08Z",
    });

    const phaseTotal = Object.values(durations.phaseDurations).reduce((sum, value) => sum + value, 0);
    expect(phaseTotal).toBe(durations.leadTimeMs);
  });
});
