import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { getPRsLabels, getWorkflowRun, listJobsForWorkflowRun } from "./github/github";
import { traceWorkflowRun } from "./tracing/job";
import { type Attributes, createTracerProvider } from "./tracing/trace";

async function run() {
  const otlpEndpoint = core.getInput("otlpEndpoint");
  const otlpHeaders = core.getInput("otlpHeaders");
  const otelServiceName = core.getInput("otelServiceName") || process.env["OTEL_SERVICE_NAME"] || "";
  const runId = Number.parseInt(core.getInput("runId") || `${context.runId}`);
  const ghToken = core.getInput("githubToken") || process.env["GITHUB_TOKEN"] || "";
  const octokit = getOctokit(ghToken);

  core.info(`Get workflow run for ${runId}`);
  const workflowRun = await getWorkflowRun(context, octokit, runId);

  core.info("Get jobs");
  const jobs = await listJobsForWorkflowRun(context, octokit, runId);

  core.info("Get PRs labels");
  const prNumbers = workflowRun.pull_requests?.map((pr) => pr.number) ?? [];
  const prLabels = await getPRsLabels(context, octokit, prNumbers);

  core.info(`Create tracer provider for ${otlpEndpoint}`);
  const attributes: Attributes = {
    serviceName: otelServiceName || workflowRun.name || `${workflowRun.workflow_id}`,
    serviceVersion: workflowRun.head_sha,
    serviceInstanceId: [
      workflowRun.repository.full_name,
      `${workflowRun.workflow_id}`,
      `${workflowRun.id}`,
      `${workflowRun.run_attempt ?? 1}`,
    ].join("/"),
    serviceNamespace: workflowRun.repository.full_name,
  };
  const provider = createTracerProvider(otlpEndpoint, otlpHeaders, attributes);

  try {
    core.info(`Trace workflow run for ${runId} and export to ${otlpEndpoint}`);
    const traceId = await traceWorkflowRun(workflowRun, jobs, prLabels);

    core.setOutput("traceId", traceId);
    core.debug(`traceId: ${traceId}`);

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
