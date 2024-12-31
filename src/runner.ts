import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { getPRsLabels, getWorkflowRunJobs } from "./github/github";
import { traceWorkflowRun } from "./tracing/job";
import { type Attributes, createTracerProvider } from "./tracing/trace";

async function run() {
  const otlpEndpoint = core.getInput("otlpEndpoint");
  const otlpHeaders = core.getInput("otlpHeaders");
  const otelServiceName = core.getInput("otelServiceName") || process.env["OTEL_SERVICE_NAME"] || "";
  const runId = Number.parseInt(core.getInput("runId") || `${context.runId}`);
  const ghToken = core.getInput("githubToken") || process.env["GITHUB_TOKEN"] || "";
  const octokit = getOctokit(ghToken);

  core.info(`Get workflow run jobs for ${runId}`);
  const workflowRunJobs = await getWorkflowRunJobs(context, octokit, runId);

  core.info("Get PRs labels");
  const prNumbers = workflowRunJobs.workflowRun.pull_requests?.map((pr) => pr.number) ?? [];
  const prLabels = await getPRsLabels(context, octokit, prNumbers);

  core.info(`Create tracer provider for ${otlpEndpoint}`);
  const attributes: Attributes = {
    serviceName: otelServiceName || workflowRunJobs.workflowRun.name || `${workflowRunJobs.workflowRun.workflow_id}`,
    serviceVersion: workflowRunJobs.workflowRun.head_sha,
    serviceInstanceId: [
      workflowRunJobs.workflowRun.repository.full_name,
      `${workflowRunJobs.workflowRun.workflow_id}`,
      `${workflowRunJobs.workflowRun.id}`,
      `${workflowRunJobs.workflowRun.run_attempt ?? 1}`,
    ].join("/"),
    serviceNamespace: workflowRunJobs.workflowRun.repository.full_name,
  };
  const provider = createTracerProvider(otlpEndpoint, otlpHeaders, attributes);

  try {
    core.info(`Trace workflow run for ${runId} and export to ${otlpEndpoint}`);
    const traceId = await traceWorkflowRun(workflowRunJobs, prLabels);
    core.setOutput("traceId", traceId);

    core.info("Flush and shutdown tracer provider");
    await provider.forceFlush();
    await provider.shutdown();
    core.info("Provider shutdown");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error);
    } else {
      core.setFailed(`Unknown error: ${JSON.stringify(error)}`);
    }
  }
}

export { run };
