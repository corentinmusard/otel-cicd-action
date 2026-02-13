import type { context } from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import type { components } from "@octokit/openapi-types";

type Context = typeof context;
type Octokit = InstanceType<typeof GitHub>;

interface PullRequestData {
  labels: string[];
  details: components["schemas"]["pull-request"] | null;
  firstCommitAuthorDate: string | null;
  firstApprovedAt: string | null;
  readyForReviewAt: string | null;
}

async function getWorkflowRun(context: Context, octokit: Octokit, runId: number) {
  const res = await octokit.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: runId,
  });
  return res.data;
}

async function listJobsForWorkflowRun(context: Context, octokit: Octokit, runId: number) {
  return await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
    ...context.repo,
    run_id: runId,
    filter: "latest", // risk of missing a run if re-run happens between Action trigger and this query
    per_page: 100,
  });
}

async function getJobsAnnotations(context: Context, octokit: Octokit, jobIds: number[]) {
  const annotations: Record<number, components["schemas"]["check-annotation"][]> = {};

  for (const jobId of jobIds) {
    annotations[jobId] = await listAnnotations(context, octokit, jobId);
  }
  return annotations;
}

async function listAnnotations(context: Context, octokit: Octokit, checkRunId: number) {
  return await octokit.paginate(octokit.rest.checks.listAnnotations, {
    ...context.repo,
    check_run_id: checkRunId,
  });
}

async function getPRsLabels(context: Context, octokit: Octokit, prNumbers: number[]) {
  const labels: Record<number, string[]> = {};

  for (const prNumber of prNumbers) {
    labels[prNumber] = await listLabelsOnIssue(context, octokit, prNumber);
  }
  return labels;
}

async function listLabelsOnIssue(context: Context, octokit: Octokit, prNumber: number) {
  return await octokit.paginate(
    octokit.rest.issues.listLabelsOnIssue,
    {
      ...context.repo,
      issue_number: prNumber,
    },
    (response) => response.data.map((issue) => issue.name)
  );
}

async function getPullRequest(context: Context, octokit: Octokit, prNumber: number) {
  const res = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: prNumber,
  });
  return res.data;
}

async function listPullRequestCommits(context: Context, octokit: Octokit, prNumber: number) {
  return await octokit.paginate(octokit.rest.pulls.listCommits, {
    ...context.repo,
    pull_number: prNumber,
    per_page: 100,
  });
}

async function listPullRequestReviews(context: Context, octokit: Octokit, prNumber: number) {
  return await octokit.paginate(octokit.rest.pulls.listReviews, {
    ...context.repo,
    pull_number: prNumber,
    per_page: 100,
  });
}

async function listPullRequestEvents(context: Context, octokit: Octokit, prNumber: number) {
  return await octokit.paginate(octokit.rest.issues.listEvents, {
    ...context.repo,
    issue_number: prNumber,
    per_page: 100,
  });
}

export {
  getWorkflowRun,
  listJobsForWorkflowRun,
  getJobsAnnotations,
  getPRsLabels,
  getPullRequest,
  listPullRequestCommits,
  listPullRequestReviews,
  listPullRequestEvents,
  type PullRequestData,
  type Octokit,
};
