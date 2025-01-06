import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { ResourceAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import { getJobsAnnotations, getPRsLabels, getWorkflowRun, listJobsForWorkflowRun } from "./github";
import { traceWorkflowRun } from "./trace/workflow";
import { createTracerProvider, stringToRecord } from "./tracer";

async function run() {
  try {
    const otlpEndpoint = core.getInput("otlpEndpoint");
    const otlpHeaders = core.getInput("otlpHeaders");
    const otelServiceName = core.getInput("otelServiceName") || process.env["OTEL_SERVICE_NAME"] || "";
    const runId = Number.parseInt(core.getInput("runId") || `${context.runId}`);
    const extraAttributes = stringToRecord(core.getInput("extraAttributes"));
    const ghToken = core.getInput("githubToken") || process.env["GITHUB_TOKEN"] || "";
    const octokit = getOctokit(ghToken);

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
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      core.info(`Failed to get job annotations: ${message}}`);
    }

    core.info("Get PRs labels");
    const prNumbers = (workflowRun.pull_requests ?? []).map((pr) => pr.number);
    let prLabels = {};
    try {
      prLabels = await getPRsLabels(context, octokit, prNumbers);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      core.info(`Failed to get PRs labels: ${message}}`);
    }

    core.info(`Create tracer provider for ${otlpEndpoint}`);
    const attributes: ResourceAttributes = {
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
    const provider = createTracerProvider(otlpEndpoint, otlpHeaders, attributes);

    core.info(`Trace workflow run for ${runId} and export to ${otlpEndpoint}`);
    const traceId = await traceWorkflowRun(workflowRun, jobs, jobAnnotations, prLabels);

    core.setOutput("traceId", traceId);
    core.info(`traceId: ${traceId}`);

    core.info("Flush and shutdown tracer provider");
    await provider.forceFlush();
    await provider.shutdown();
    core.info("Provider shutdown");
  } catch (error) {
    const message = error instanceof Error ? error : JSON.stringify(error);
    core.setFailed(message);
  }
}

export { run };
