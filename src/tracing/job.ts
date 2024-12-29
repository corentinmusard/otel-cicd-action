import * as core from "@actions/core";
import { type Context, ROOT_CONTEXT, type Span, SpanStatusCode, type TraceAPI, trace } from "@opentelemetry/api";
import type { BasicTracerProvider, Tracer } from "@opentelemetry/sdk-trace-base";
import type { WorkflowArtifactLookup, WorkflowRunJob, WorkflowRunJobs } from "../github/github";
import { traceWorkflowRunStep } from "./step";

async function traceWorkflowRunJobs(
  provider: BasicTracerProvider,
  workflowRunJobs: WorkflowRunJobs,
  prLabels: Record<number, string[]>,
) {
  const tracer = provider.getTracer("otel-cicd-action");

  const startTime = new Date(workflowRunJobs.workflowRun.run_started_at || workflowRunJobs.workflowRun.created_at);

  let headRef: string | undefined;
  let baseRef: string | undefined;
  let baseSha: string | undefined;
  let pull_requests = {};
  if (workflowRunJobs.workflowRun.pull_requests && workflowRunJobs.workflowRun.pull_requests.length > 0) {
    headRef = workflowRunJobs.workflowRun.pull_requests[0].head?.ref;
    baseRef = workflowRunJobs.workflowRun.pull_requests[0].base?.ref;
    baseSha = workflowRunJobs.workflowRun.pull_requests[0].base?.sha;

    pull_requests = workflowRunJobs.workflowRun.pull_requests.reduce((result, pr, idx) => {
      const prefix = `github.pull_requests.${idx}`;

      return {
        ...result,
        [`${prefix}.id`]: pr.id,
        [`${prefix}.url`]: pr.url,
        [`${prefix}.number`]: pr.number,
        [`${prefix}.labels`]: prLabels[pr.number],
        [`${prefix}.head.sha`]: pr.head.sha,
        [`${prefix}.head.ref`]: pr.head.ref,
        [`${prefix}.head.repo.id`]: pr.head.repo.id,
        [`${prefix}.head.repo.url`]: pr.head.repo.url,
        [`${prefix}.head.repo.name`]: pr.head.repo.name,
        [`${prefix}.base.ref`]: pr.base.ref,
        [`${prefix}.base.sha`]: pr.base.sha,
        [`${prefix}.base.repo.id`]: pr.base.repo.id,
        [`${prefix}.base.repo.url`]: pr.base.repo.url,
        [`${prefix}.base.repo.name`]: pr.base.repo.name,
      };
    }, {});
  }

  const rootSpan = tracer.startSpan(
    workflowRunJobs.workflowRun.name || `${workflowRunJobs.workflowRun.workflow_id}`,
    {
      attributes: {
        // OpenTelemetry semantic convention CICD Pipeline Attributes
        // https://opentelemetry.io/docs/specs/semconv/attributes-registry/cicd/
        "cicd.pipeline.name": workflowRunJobs.workflowRun.name || undefined,
        "cicd.pipeline.run.id": workflowRunJobs.workflowRun.id,
        "github.workflow_id": workflowRunJobs.workflowRun.workflow_id,
        "github.run_id": workflowRunJobs.workflowRun.id,
        "github.run_number": workflowRunJobs.workflowRun.run_number,
        "github.run_attempt": workflowRunJobs.workflowRun.run_attempt || 1,
        "github.html_url": workflowRunJobs.workflowRun.html_url,
        "github.workflow_url": workflowRunJobs.workflowRun.workflow_url,
        "github.event": workflowRunJobs.workflowRun.event,
        "github.workflow": workflowRunJobs.workflowRun.name || undefined,
        "github.conclusion": workflowRunJobs.workflowRun.conclusion || undefined,
        "github.created_at": workflowRunJobs.workflowRun.created_at,
        "github.updated_at": workflowRunJobs.workflowRun.updated_at,
        "github.run_started_at": workflowRunJobs.workflowRun.run_started_at,
        "github.author_name": workflowRunJobs.workflowRun.head_commit?.author?.name || undefined,
        "github.author_email": workflowRunJobs.workflowRun.head_commit?.author?.email || undefined,
        "github.head_commit.id": workflowRunJobs.workflowRun.head_commit?.id || undefined,
        "github.head_commit.tree_id": workflowRunJobs.workflowRun.head_commit?.tree_id || undefined,
        "github.head_commit.author.name": workflowRunJobs.workflowRun.head_commit?.author?.email || undefined,
        "github.head_commit.author.email": workflowRunJobs.workflowRun.head_commit?.author?.email || undefined,
        "github.head_commit.committer.name": workflowRunJobs.workflowRun.head_commit?.committer?.email || undefined,
        "github.head_commit.committer.email": workflowRunJobs.workflowRun.head_commit?.committer?.email || undefined,
        "github.head_commit.message": workflowRunJobs.workflowRun.head_commit?.message || undefined,
        "github.head_commit.timestamp": workflowRunJobs.workflowRun.head_commit?.timestamp || undefined,
        "github.head_sha": workflowRunJobs.workflowRun.head_sha,
        "github.head_ref": headRef,
        "github.base_ref": baseRef,
        "github.base_sha": baseSha,
        error: workflowRunJobs.workflowRun.conclusion === "failure",
        ...pull_requests,
      },
      root: true,
      startTime,
    },
    ROOT_CONTEXT,
  );

  const code = workflowRunJobs.workflowRun.conclusion === "failure" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
  rootSpan.setStatus({ code });

  core.debug(`TraceID: ${rootSpan.spanContext().traceId}`);
  core.debug(`Root Span: ${rootSpan.spanContext().traceId}: ${workflowRunJobs.workflowRun.created_at}`);

  try {
    if (workflowRunJobs.jobs.length > 0) {
      // "Queued" span represent the time between the workflow has been started_at and
      // the first job has been picked up by a runner
      const firstJob = workflowRunJobs.jobs[0];
      const queuedCtx = trace.setSpan(ROOT_CONTEXT, rootSpan);
      const queuedSpan = tracer.startSpan("Queued", { startTime }, queuedCtx);
      queuedSpan.end(new Date(firstJob.started_at));
    }

    for (const job of workflowRunJobs.jobs) {
      await traceWorkflowRunJob({
        parentSpan: rootSpan,
        parentContext: ROOT_CONTEXT,
        trace,
        tracer,
        job,
        workflowArtifacts: workflowRunJobs.workflowRunArtifacts,
      });
    }
  } finally {
    rootSpan.end(new Date(workflowRunJobs.workflowRun.updated_at));
  }
  return rootSpan.spanContext().traceId;
}

type TraceWorkflowRunJobParams = {
  parentSpan: Span;
  parentContext: Context;
  trace: TraceAPI;
  tracer: Tracer;
  job: WorkflowRunJob;
  workflowArtifacts: WorkflowArtifactLookup;
};

async function traceWorkflowRunJob({
  parentSpan,
  parentContext,
  trace,
  tracer,
  job,
  workflowArtifacts,
}: TraceWorkflowRunJobParams) {
  core.debug(`Trace Job ${job.id}`);
  if (!job.completed_at) {
    core.warning(`Job ${job.id} is not completed yet`);
    return;
  }

  const ctx = trace.setSpan(parentContext, parentSpan);
  const startTime = new Date(job.started_at);
  const completedTime = new Date(job.completed_at);

  // Heuristic for task type.
  // taskType can be either "build", "test", or "deploy" according to the OpenTelemetry semantic convention
  let taskType: string | undefined;
  if (job.name.toLowerCase().includes("build")) {
    taskType = "build";
  } else if (job.name.toLowerCase().includes("test")) {
    taskType = "test";
  } else if (job.name.toLowerCase().includes("deploy")) {
    taskType = "deploy";
  }

  const span = tracer.startSpan(
    job.name,
    {
      attributes: {
        // OpenTelemetry semantic convention CICD Pipeline Attributes
        // https://opentelemetry.io/docs/specs/semconv/attributes-registry/cicd/
        "cicd.pipeline.task.name": job.name,
        "cicd.pipeline.task.run.id": job.id,
        "cicd.pipeline.task.run.url.full": job.html_url || undefined,
        "cicd.pipeline.task.type": taskType,
        "github.job.id": job.id,
        "github.job.name": job.name,
        "github.job.run_id": job.run_id,
        "github.job.run_attempt": job.run_attempt || 1,
        "github.job.runner_group_id": job.runner_group_id || undefined,
        "github.job.runner_group_name": job.runner_group_name || undefined,
        "github.job.runner_name": job.runner_name || undefined,
        "github.job.conclusion": job.conclusion || undefined,
        "github.job.labels": job.labels.join(", ") || undefined,
        "github.job.started_at": job.started_at || undefined,
        "github.job.completed_at": job.completed_at || undefined,
        "github.conclusion": job.conclusion || undefined,
        error: job.conclusion === "failure",
      },
      startTime,
    },
    ctx,
  );
  const spanId = span.spanContext().spanId;
  core.debug(`Job Span<${spanId}>: Started<${job.started_at}>`);

  try {
    const code = job.conclusion === "failure" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
    span.setStatus({ code });

    const numSteps = job.steps?.length ?? 0;
    core.debug(`Trace ${numSteps} Steps`);

    for (const step of job.steps ?? []) {
      await traceWorkflowRunStep({
        parentSpan: span,
        parentContext: ctx,
        trace,
        tracer,
        jobName: job.name,
        step,
        workflowArtifacts,
      });
    }
  } finally {
    core.debug(`Job Span<${spanId}>: Ended<${job.completed_at}>`);
    // Some skipped and post jobs return completed_at dates that are older than started_at
    span.end(new Date(Math.max(startTime.getTime(), completedTime.getTime())));
  }
}

export { traceWorkflowRunJobs };
