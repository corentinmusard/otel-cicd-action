import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { getPRsLabels, getWorkflowRunJobs } from "./github/github";
import { traceWorkflowRunJobs } from "./tracing/job";
import { createTracerProvider } from "./tracing/trace";

async function run() {
  const otlpEndpoint = core.getInput("otlpEndpoint");
  const otlpHeaders = core.getInput("otlpHeaders");
  const otelServiceName = core.getInput("otelServiceName") || process.env["OTEL_SERVICE_NAME"] || "";
  const runId = Number.parseInt(core.getInput("runId") || `${context.runId}`);
  const ghToken = core.getInput("githubToken") || process.env["GITHUB_TOKEN"] || "";
  const octokit = getOctokit(ghToken);

  core.info(`Get Workflow Run Jobs for ${runId}`);
  const workflowRunJobs = await getWorkflowRunJobs(context, octokit, runId);

  core.info("Get PRs labels");
  const prNumbers = workflowRunJobs.workflowRun.pull_requests?.map((pr) => pr.number) ?? [];
  const prLabels = await getPRsLabels(context, octokit, prNumbers);

  core.info(`Create Trace Provider for ${otlpEndpoint}`);
  const provider = createTracerProvider(otlpEndpoint, otlpHeaders, workflowRunJobs, otelServiceName);

  try {
    core.info(`Trace Workflow Run Jobs for ${runId} and export to ${otlpEndpoint}`);
    const traceId = await traceWorkflowRunJobs(provider, workflowRunJobs, prLabels);
    core.setOutput("traceId", traceId);
    await provider.forceFlush();
  } finally {
    core.info("Shutdown Trace Provider");
    setTimeout(() => {
      provider
        .shutdown()
        .then(() => {
          core.info("Provider shutdown");
        })
        .catch((error: Error) => {
          core.warning(error.message);
        });
    }, 2000);
  }
}

export { run };
