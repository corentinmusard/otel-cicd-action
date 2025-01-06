import * as core from "@actions/core";
import type { components } from "@octokit/openapi-types";
import { type Attributes, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ATTR_CICD_PIPELINE_TASK_NAME,
  ATTR_CICD_PIPELINE_TASK_RUN_ID,
  ATTR_CICD_PIPELINE_TASK_RUN_URL_FULL,
  ATTR_CICD_PIPELINE_TASK_TYPE,
  CICD_PIPELINE_TASK_TYPE_VALUE_BUILD,
  CICD_PIPELINE_TASK_TYPE_VALUE_DEPLOY,
  CICD_PIPELINE_TASK_TYPE_VALUE_TEST,
} from "@opentelemetry/semantic-conventions/incubating";
import { traceStep } from "./step";

const tracer = trace.getTracer("otel-cicd-action");

async function traceJob(job: components["schemas"]["job"], annotations?: components["schemas"]["check-annotation"][]) {
  if (!job.completed_at) {
    core.info(`Job ${job.id} is not completed yet`);
    return;
  }

  const startTime = new Date(job.started_at);
  const completedTime = new Date(job.completed_at);
  const attributes = {
    ...jobToAttributes(job),
    ...annotationsToAttributes(annotations),
  };

  await tracer.startActiveSpan(job.name, { attributes, startTime }, async (span) => {
    const code = job.conclusion === "failure" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
    span.setStatus({ code });

    for (const step of job.steps ?? []) {
      await traceStep(step);
    }

    // Some skipped and post jobs return completed_at dates that are older than started_at
    span.end(new Date(Math.max(startTime.getTime(), completedTime.getTime())));
  });
}

function jobToAttributes(job: components["schemas"]["job"]): Attributes {
  // Heuristic for task type
  let taskType: string | undefined;
  if (job.name.toLowerCase().includes("build")) {
    taskType = CICD_PIPELINE_TASK_TYPE_VALUE_BUILD;
  } else if (job.name.toLowerCase().includes("test")) {
    taskType = CICD_PIPELINE_TASK_TYPE_VALUE_TEST;
  } else if (job.name.toLowerCase().includes("deploy")) {
    taskType = CICD_PIPELINE_TASK_TYPE_VALUE_DEPLOY;
  }

  return {
    // OpenTelemetry semantic convention CICD Pipeline Attributes
    // https://opentelemetry.io/docs/specs/semconv/attributes-registry/cicd/
    [ATTR_CICD_PIPELINE_TASK_NAME]: job.name,
    [ATTR_CICD_PIPELINE_TASK_RUN_ID]: job.id,
    [ATTR_CICD_PIPELINE_TASK_RUN_URL_FULL]: job.html_url ?? undefined,
    [ATTR_CICD_PIPELINE_TASK_TYPE]: taskType,
    "github.job.id": job.id,
    "github.job.name": job.name,
    "github.job.run_id": job.run_id,
    "github.job.run_url": job.run_url,
    "github.job.run_attempt": job.run_attempt ?? 1,
    "github.job.node_id": job.node_id,
    "github.job.head_sha": job.head_sha,
    "github.job.url": job.url,
    "github.job.html_url": job.html_url ?? undefined,
    "github.job.status": job.status,
    "github.job.runner_id": job.runner_id ?? undefined,
    "github.job.runner_group_id": job.runner_group_id ?? undefined,
    "github.job.runner_group_name": job.runner_group_name ?? undefined,
    "github.job.runner_name": job.runner_name ?? undefined,
    "github.job.conclusion": job.conclusion ?? undefined,
    "github.job.labels": job.labels.join(", "),
    "github.job.created_at": job.created_at,
    "github.job.started_at": job.started_at,
    "github.job.completed_at": job.completed_at ?? undefined,
    "github.conclusion": job.conclusion ?? undefined, // FIXME: it overrides the workflow conclusion
    "github.job.check_run_url": job.check_run_url,
    "github.job.workflow_name": job.workflow_name ?? undefined,
    "github.job.head_branch": job.head_branch ?? undefined,
    error: job.conclusion === "failure",
  };
}

function annotationsToAttributes(annotations: components["schemas"]["check-annotation"][] | undefined) {
  const attributes: Attributes = {};

  for (let i = 0; annotations && i < annotations.length; i++) {
    const annotation = annotations[i];
    const prefix = `github.job.annotations.${i}`;

    attributes[`${prefix}.level`] = annotation.annotation_level ?? undefined;
    attributes[`${prefix}.message`] = annotation.message ?? undefined;
  }

  return attributes;
}

export { traceJob };
