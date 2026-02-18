import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { RequestError } from "@octokit/request-error";
import type { Attributes } from "@opentelemetry/api";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import type { PullRequestData } from "./github";
import {
  extractPRNumberFromCommitMessage,
  getJobsAnnotations,
  getPRsLabels,
  getPullRequest,
  getWorkflowRun,
  listJobsForWorkflowRun,
  listPullRequestCommits,
  listPullRequestEvents,
  listPullRequestReviews,
} from "./github";
import { createMeterProvider } from "./meter";
import { recordWorkflowMetrics } from "./metrics/workflow";
import { traceWorkflowRun } from "./trace/workflow";
import { createTracerProvider, stringToRecord } from "./tracer";

function isOctokitError(err: unknown): err is RequestError {
  return !!err && typeof err === "object" && "status" in err;
}

async function getPullRequestData(octokit: ReturnType<typeof getOctokit>, prNumber: number) {
  const prDetails = await getPullRequest(context, octokit, prNumber);
  core.info(
    `Got PR details: number=${prDetails.number}, state=${prDetails.state}, merged_at=${prDetails.merged_at ?? "null"}`
  );

  const commits = await listPullRequestCommits(context, octokit, prNumber);
  core.info(`Got ${commits.length} commit(s) for PR #${prNumber}`);
  let firstCommitAuthorDate: string | null = null;

  const reviews = await listPullRequestReviews(context, octokit, prNumber);
  core.info(`Got ${reviews.length} review(s) for PR #${prNumber}`);
  const firstApprovedAt = getFirstApprovedAt(reviews);

  const events = await listPullRequestEvents(context, octokit, prNumber);
  core.info(`Got ${events.length} event(s) for PR #${prNumber}`);
  const readyForReviewAt = getReadyForReviewAt(events);

  for (const commit of commits) {
    const authorDate = commit.commit?.author?.date ?? null;
    if (!authorDate) {
      continue;
    }

    if (!firstCommitAuthorDate || new Date(authorDate).getTime() < new Date(firstCommitAuthorDate).getTime()) {
      firstCommitAuthorDate = authorDate;
    }
  }

  core.info(`First commit author date for PR #${prNumber}: ${firstCommitAuthorDate ?? "null"}`);

  return { details: prDetails, firstCommitAuthorDate, firstApprovedAt, readyForReviewAt };
}

function getFirstApprovedAt(reviews: Awaited<ReturnType<typeof listPullRequestReviews>>): string | null {
  let firstApprovedAt: string | null = null;

  for (const review of reviews) {
    if (review.state !== "APPROVED") {
      continue;
    }

    const approvedAt = review.submitted_at ?? null;
    if (!approvedAt) {
      continue;
    }

    if (!firstApprovedAt || new Date(approvedAt).getTime() < new Date(firstApprovedAt).getTime()) {
      firstApprovedAt = approvedAt;
    }
  }

  return firstApprovedAt;
}

function getReadyForReviewAt(events: Awaited<ReturnType<typeof listPullRequestEvents>>): string | null {
  let readyForReviewAt: string | null = null;

  for (const event of events) {
    if (event.event !== "ready_for_review") {
      continue;
    }

    const readyAt = event.created_at ?? null;
    if (!readyAt) {
      continue;
    }

    if (!readyForReviewAt || new Date(readyAt).getTime() < new Date(readyForReviewAt).getTime()) {
      readyForReviewAt = readyAt;
    }
  }

  return readyForReviewAt;
}

async function safeGetPullRequestData(octokit: ReturnType<typeof getOctokit>, prNumbers: number[]) {
  const prs: PullRequestData[] = [];
  let prLabels: Record<number, string[]> = {};

  if (prNumbers.length === 0) {
    return prs;
  }

  core.info("Get PR labels");
  try {
    prLabels = await getPRsLabels(context, octokit, prNumbers);
  } catch (error) {
    if (isOctokitError(error)) {
      core.info(`Failed to get PR labels: ${error.message}}`);
    } else {
      throw error;
    }
  }

  for (const prNumber of prNumbers) {
    try {
      const { details, firstCommitAuthorDate, firstApprovedAt, readyForReviewAt } = await getPullRequestData(
        octokit,
        prNumber
      );
      prs.push({
        labels: prLabels[prNumber] ?? [],
        details,
        firstCommitAuthorDate,
        firstApprovedAt,
        readyForReviewAt,
      });
    } catch (error) {
      if (isOctokitError(error)) {
        core.info(`Failed to get PR data for ${prNumber}: ${error.message}}`);
        prs.push({
          labels: prLabels[prNumber] ?? [],
          details: null,
          firstCommitAuthorDate: null,
          firstApprovedAt: null,
          readyForReviewAt: null,
        });
      } else {
        throw error;
      }
    }
  }

  core.info(`Fetched data for ${prs.length} PR(s), ${prs.filter((p) => p.details).length} with details`);

  return prs;
}

async function fetchGithub(token: string, runId: number) {
  const octokit = getOctokit(token);

  core.info(`Get workflow run for ${runId}`);
  const workflowRun = await getWorkflowRun(context, octokit, runId);

  core.info("Get jobs");
  const jobs = await listJobsForWorkflowRun(context, octokit, runId);

  core.info("Get job annotations");
  const jobsId = (jobs ?? []).map((job) => job.id);
  let jobAnnotations = {};
  try {
    jobAnnotations = await getJobsAnnotations(context, octokit, jobsId);
  } catch (error) {
    if (isOctokitError(error)) {
      core.info(`Failed to get job annotations: ${error.message}}`);
    } else {
      throw error;
    }
  }

  let prNumbers = (workflowRun.pull_requests ?? []).map((pr) => pr.number);

  // Fallback: extract from commit message for push events when no PR data from API
  if (prNumbers.length === 0 && workflowRun.event === "push") {
    const extractedPR = extractPRNumberFromCommitMessage(workflowRun.head_commit?.message);
    if (extractedPR !== null) {
      core.info(
        `Extracted PR #${extractedPR} from commit message: "${workflowRun.head_commit?.message?.split("\n")[0]}"`
      );
      prNumbers = [extractedPR];
    }
  }

  const prs = await safeGetPullRequestData(octokit, prNumbers);

  return { workflowRun, jobs, jobAnnotations, prs };
}

async function run() {
  try {
    const otlpEndpoint = core.getInput("otlpEndpoint");
    const otlpHeaders = core.getInput("otlpHeaders");
    const otelServiceName = core.getInput("otelServiceName") || process.env["OTEL_SERVICE_NAME"] || "";
    const runId = Number.parseInt(core.getInput("runId") || `${context.runId}`, 10);
    const extraAttributes = stringToRecord(core.getInput("extraAttributes"));
    const ghToken = core.getInput("githubToken") || process.env["GITHUB_TOKEN"] || "";

    core.info("Use Github API to fetch workflow data");
    const { workflowRun, jobs, jobAnnotations, prs } = await fetchGithub(ghToken, runId);

    core.info(`Create tracer provider for ${otlpEndpoint}`);
    const attributes: Attributes = {
      [ATTR_SERVICE_NAME]: otelServiceName || workflowRun.name || `${workflowRun.workflow_id}`,
      [ATTR_SERVICE_INSTANCE_ID]: [
        workflowRun.repository.full_name,
        `${workflowRun.workflow_id}`,
        `${workflowRun.id}`,
        `${workflowRun.run_attempt ?? 1}`,
      ].join("/"),
      [ATTR_SERVICE_NAMESPACE]: workflowRun.repository.full_name,
      [ATTR_SERVICE_VERSION]: workflowRun.head_sha,
      ...extraAttributes,
    };
    const tracerProvider = createTracerProvider(otlpEndpoint, otlpHeaders, attributes);
    const meterProvider = createMeterProvider(otlpEndpoint, otlpHeaders, attributes);

    core.info(`Trace workflow run for ${runId} and export to ${otlpEndpoint}`);
    const traceId = traceWorkflowRun(workflowRun, jobs, jobAnnotations, prs);

    core.setOutput("traceId", traceId);
    core.info(`traceId: ${traceId}`);

    core.info("Record workflow metrics");
    for (const prData of prs) {
      recordWorkflowMetrics(workflowRun, prData);
    }

    core.info("Flush and shutdown providers");
    await tracerProvider.forceFlush();
    await meterProvider.forceFlush();
    await tracerProvider.shutdown();
    await meterProvider.shutdown();
    core.info("Providers shutdown");
  } catch (error) {
    const message = error instanceof Error ? error : JSON.stringify(error);
    core.setFailed(message);
  }
}

export { run, isOctokitError };
