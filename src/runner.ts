import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { RequestError } from "@octokit/request-error";
import type { Attributes } from "@opentelemetry/api";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import type { PullRequestData } from "./github";
import {
  getJobsAnnotations,
  getPRsLabels,
  getPullRequest,
  getWorkflowRun,
  listJobsForWorkflowRun,
  listPullRequestCommits,
} from "./github";
import { createMeterProvider } from "./meter";
import { recordWorkflowMetrics } from "./metrics/workflow";
import { traceWorkflowRun } from "./trace/workflow";
import { createTracerProvider, stringToRecord } from "./tracer";

function isOctokitError(err: unknown): err is RequestError {
  return !!err && typeof err === "object" && "status" in err;
}

async function getPullRequestData(octokit: ReturnType<typeof getOctokit>, prNumber: number) {
  core.info(`Get details for PR #${prNumber}`);
  const prDetails = await getPullRequest(context, octokit, prNumber);

  core.info(`Get commits for PR #${prNumber}`);
  const commits = await listPullRequestCommits(context, octokit, prNumber);
  let firstCommitAuthorDate: string | null = null;

  for (const commit of commits) {
    const authorDate = commit.commit?.author?.date ?? null;
    if (!authorDate) {
      continue;
    }

    if (!firstCommitAuthorDate || new Date(authorDate).getTime() < new Date(firstCommitAuthorDate).getTime()) {
      firstCommitAuthorDate = authorDate;
    }
  }

  return { details: prDetails, firstCommitAuthorDate };
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
      const { details, firstCommitAuthorDate } = await getPullRequestData(octokit, prNumber);
      prs.push({
        labels: prLabels[prNumber] ?? [],
        details,
        firstCommitAuthorDate,
      });
    } catch (error) {
      if (isOctokitError(error)) {
        core.info(`Failed to get PR data for ${prNumber}: ${error.message}}`);
        prs.push({
          labels: prLabels[prNumber] ?? [],
          details: null,
          firstCommitAuthorDate: null,
        });
      } else {
        throw error;
      }
    }
  }

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

  const prNumbers = (workflowRun.pull_requests ?? []).map((pr) => pr.number);
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
      recordWorkflowMetrics(workflowRun, prData.details, prData.firstCommitAuthorDate);
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
