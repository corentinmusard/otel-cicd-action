import * as core from "@actions/core";
import type { components } from "@octokit/openapi-types";
import { type Attributes, SpanStatusCode, context, trace } from "@opentelemetry/api";
import {
  ATTR_CICD_PIPELINE_NAME,
  ATTR_CICD_PIPELINE_RUN_ID,
  ATTR_CICD_PIPELINE_TASK_NAME,
  ATTR_CICD_PIPELINE_TASK_RUN_ID,
  ATTR_CICD_PIPELINE_TASK_RUN_URL_FULL,
  ATTR_CICD_PIPELINE_TASK_TYPE,
  CICD_PIPELINE_TASK_TYPE_VALUE_BUILD,
  CICD_PIPELINE_TASK_TYPE_VALUE_DEPLOY,
  CICD_PIPELINE_TASK_TYPE_VALUE_TEST,
} from "@opentelemetry/semantic-conventions/incubating";
import type { JobArtifactMap, StepArtifactMap } from "../github/github";
import { traceStep } from "./step";

const tracer = trace.getTracer("otel-cicd-action");

async function traceWorkflowRun(
  workflowRun: components["schemas"]["workflow-run"],
  jobs: components["schemas"]["job"][],
  artifacts: JobArtifactMap,
  prLabels: Record<number, string[]>,
) {
  const startTime = new Date(workflowRun.run_started_at ?? workflowRun.created_at);
  const attributes = workflowRunToAttributes(workflowRun, prLabels);

  return await tracer.startActiveSpan(
    workflowRun.name ?? workflowRun.display_title,
    { attributes, root: true, startTime },
    async (rootSpan) => {
      const code = workflowRun.conclusion === "failure" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
      rootSpan.setStatus({ code });

      if (jobs.length > 0) {
        // "Queued" span represent the time between the workflow has been started_at and
        // the first job has been picked up by a runner
        const queuedSpan = tracer.startSpan("Queued", { startTime }, context.active());
        queuedSpan.end(new Date(jobs[0].started_at));
      }

      for (const job of jobs) {
        await traceJob(job, artifacts.get(job.name));
      }

      rootSpan.end(new Date(workflowRun.updated_at));
      return rootSpan.spanContext().traceId;
    },
  );
}

function workflowRunToAttributes(
  workflowRun: components["schemas"]["workflow-run"],
  prLabels: Record<number, string[]>,
): Attributes {
  return {
    // OpenTelemetry semantic convention CICD Pipeline Attributes
    // https://opentelemetry.io/docs/specs/semconv/attributes-registry/cicd/
    [ATTR_CICD_PIPELINE_NAME]: workflowRun.name ?? undefined,
    [ATTR_CICD_PIPELINE_RUN_ID]: workflowRun.id,
    "github.workflow_id": workflowRun.workflow_id,
    "github.run_id": workflowRun.id,
    "github.run_number": workflowRun.run_number,
    "github.run_attempt": workflowRun.run_attempt ?? 1,
    ...referencedWorkflowsToAttributes(workflowRun.referenced_workflows),
    "github.url": workflowRun.url,
    "github.html_url": workflowRun.html_url,
    "github.workflow_url": workflowRun.workflow_url,
    "github.event": workflowRun.event,
    "github.status": workflowRun.status ?? undefined,
    "github.workflow": workflowRun.name ?? undefined,
    "github.node_id": workflowRun.node_id,
    "github.check_suite_id": workflowRun.check_suite_id,
    "github.check_suite_node_id": workflowRun.check_suite_node_id,
    "github.conclusion": workflowRun.conclusion ?? undefined,
    "github.created_at": workflowRun.created_at,
    "github.updated_at": workflowRun.updated_at,
    "github.run_started_at": workflowRun.run_started_at,
    "github.jobs_url": workflowRun.jobs_url,
    "github.logs_url": workflowRun.logs_url,
    "github.check_suite_url": workflowRun.check_suite_url,
    "github.artifacts_url": workflowRun.artifacts_url,
    "github.cancel_url": workflowRun.cancel_url,
    "github.rerun_url": workflowRun.rerun_url,
    "github.previous_attempt_url": workflowRun.previous_attempt_url ?? undefined,
    ...headCommitToAttributes(workflowRun.head_commit),
    "github.head_branch": workflowRun.head_branch ?? undefined,
    "github.head_sha": workflowRun.head_sha,
    "github.path": workflowRun.path,
    "github.display_title": workflowRun.display_title,
    error: workflowRun.conclusion === "failure",
    ...prsToAttributes(workflowRun.pull_requests, prLabels),
  };
}

function referencedWorkflowsToAttributes(refs: components["schemas"]["referenced-workflow"][] | null | undefined) {
  const attributes: Attributes = {};

  for (let i = 0; refs && i < refs.length; i++) {
    const ref = refs[i];
    const prefix = `github.referenced_workflows.${i}`;

    attributes[`${prefix}.path`] = ref.path;
    attributes[`${prefix}.sha`] = ref.sha;
    attributes[`${prefix}.ref`] = ref.ref;
  }

  return attributes;
}

function headCommitToAttributes(head_commit: components["schemas"]["nullable-simple-commit"]): Attributes {
  return {
    "github.author_name": head_commit?.author?.name, // deprecated, duplicates of github.head_commit.author.name
    "github.author_email": head_commit?.author?.email, // deprecated, duplicates of github.head_commit.author.email
    "github.head_commit.id": head_commit?.id,
    "github.head_commit.tree_id": head_commit?.tree_id,
    "github.head_commit.author.name": head_commit?.author?.name,
    "github.head_commit.author.email": head_commit?.author?.email,
    "github.head_commit.committer.name": head_commit?.committer?.name,
    "github.head_commit.committer.email": head_commit?.committer?.email,
    "github.head_commit.message": head_commit?.message,
    "github.head_commit.timestamp": head_commit?.timestamp,
  };
}

function prsToAttributes(
  pullRequests: components["schemas"]["pull-request-minimal"][] | null,
  prLabels: Record<number, string[]>,
) {
  const attributes: Attributes = {
    "github.head_ref": pullRequests?.[0]?.head?.ref,
    "github.base_ref": pullRequests?.[0]?.base?.ref,
    "github.base_sha": pullRequests?.[0]?.base?.sha,
  };

  for (let i = 0; pullRequests && i < pullRequests.length; i++) {
    const pr = pullRequests[i];
    const prefix = `github.pull_requests.${i}`;

    attributes[`${prefix}.id`] = pr.id;
    attributes[`${prefix}.url`] = pr.url;
    attributes[`${prefix}.number`] = pr.number;
    attributes[`${prefix}.labels`] = prLabels[pr.number];
    attributes[`${prefix}.head.sha`] = pr.head.sha;
    attributes[`${prefix}.head.ref`] = pr.head.ref;
    attributes[`${prefix}.head.repo.id`] = pr.head.repo.id;
    attributes[`${prefix}.head.repo.url`] = pr.head.repo.url;
    attributes[`${prefix}.head.repo.name`] = pr.head.repo.name;
    attributes[`${prefix}.base.ref`] = pr.base.ref;
    attributes[`${prefix}.base.sha`] = pr.base.sha;
    attributes[`${prefix}.base.repo.id`] = pr.base.repo.id;
    attributes[`${prefix}.base.repo.url`] = pr.base.repo.url;
    attributes[`${prefix}.base.repo.name`] = pr.base.repo.name;
  }

  return attributes;
}

async function traceJob(job: components["schemas"]["job"], artifacts?: StepArtifactMap) {
  if (!job.completed_at) {
    core.warning(`Job ${job.id} is not completed yet`);
    return;
  }

  const startTime = new Date(job.started_at);
  const completedTime = new Date(job.completed_at);
  const attributes = jobToAttributes(job);

  await tracer.startActiveSpan(job.name, { attributes, startTime }, async (span) => {
    const code = job.conclusion === "failure" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
    span.setStatus({ code });

    for (const step of job.steps ?? []) {
      await traceStep(step, artifacts?.get(step.name));
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

export { traceWorkflowRun };
