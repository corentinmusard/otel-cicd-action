import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { components } from "@octokit/openapi-types";
import type { RequestError } from "@octokit/request-error";
import type { Attributes } from "@opentelemetry/api";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
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
  const prDetails = await getPullRequest(context, octokit, prNumber);
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

  return { prDetails, firstCommitAuthorDate };
}

async function safeGetPullRequestData(octokit: ReturnType<typeof getOctokit>, prNumber: number) {
  try {
    const { prDetails, firstCommitAuthorDate } = await getPullRequestData(octokit, prNumber);
    return { prDetails, firstCommitAuthorDate };
  } catch (error) {
    if (isOctokitError(error)) {
      core.info(`Failed to get PR data: ${error.message}}`);
      return { prDetails: null, firstCommitAuthorDate: null };
    }
    throw error;
  }
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

  core.info("Get PRs labels");
  const prNumbers = (workflowRun.pull_requests ?? []).map((pr) => pr.number);
  let prLabels = {};
  try {
    prLabels = await getPRsLabels(context, octokit, prNumbers);
  } catch (error) {
    if (isOctokitError(error)) {
      core.info(`Failed to get PRs labels: ${error.message}}`);
    } else {
      throw error;
    }
  }

  let prDetails: components["schemas"]["pull-request"] | null = null;
  let firstCommitAuthorDate: string | null = null;
  if (prNumbers.length > 0) {
    core.info("Get PR details");
    ({ prDetails, firstCommitAuthorDate } = await safeGetPullRequestData(octokit, prNumbers[0]));
  }

  return { workflowRun, jobs, jobAnnotations, prLabels, prDetails, firstCommitAuthorDate };
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
    const { workflowRun, jobs, jobAnnotations, prLabels, prDetails, firstCommitAuthorDate } = await fetchGithub(
      ghToken,
      runId
    );

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
    const traceId = traceWorkflowRun(workflowRun, jobs, jobAnnotations, prLabels);

    core.setOutput("traceId", traceId);
    core.info(`traceId: ${traceId}`);

    core.info("Record workflow metrics");
    recordWorkflowMetrics(workflowRun, prDetails, firstCommitAuthorDate);

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
