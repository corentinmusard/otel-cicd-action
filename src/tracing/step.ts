import * as core from "@actions/core";
import { type Context, type Span, SpanStatusCode, type TraceAPI } from "@opentelemetry/api";
import type { Tracer } from "@opentelemetry/sdk-trace-base";
import type { WorkflowArtifactLookup } from "../github/github";
import { traceOTLPFile } from "./trace-otlp-file";

//type Steps = components["schemas"]["job"]["steps"];
//type S = WorkflowRunJob["steps"];

type Step = {
  status: "queued" | "in_progress" | "completed";
  conclusion?: string | null;
  id?: string;
  name: string;
  number: number;
  started_at?: string | null;
  completed_at?: string | null;
};

type TraceWorkflowRunStepParams = {
  parentSpan: Span;
  parentContext: Context;
  jobName: string;
  trace: TraceAPI;
  tracer: Tracer;
  step: Step;
  workflowArtifacts: WorkflowArtifactLookup;
};

async function traceWorkflowRunStep({
  parentSpan,
  parentContext,
  jobName,
  trace,
  tracer,
  step,
  workflowArtifacts,
}: TraceWorkflowRunStepParams) {
  if (!step || !step.completed_at || !step.started_at) {
    const stepName = step?.name || "UNDEFINED";
    core.warning(`Step ${stepName} is not completed yet.`);
    return;
  }
  if (step.conclusion === "cancelled" || step.conclusion === "skipped") {
    core.info(`Step ${step.name} did not run.`);
    return;
  }

  core.debug(`Trace Step ${step.name}`);

  const ctx = trace.setSpan(parentContext, parentSpan);
  const startTime = new Date(step.started_at);
  const completedTime = new Date(step.completed_at);
  const span = tracer.startSpan(
    step.name,
    {
      attributes: {
        "github.job.step.name": step.name,
        "github.job.step.number": step.number,
        "github.job.step.started_at": step.started_at || undefined,
        "github.job.step.completed_at": step.completed_at || undefined,
        "github.job.step.id": step.id,
        error: step.conclusion === "failure",
      },
      startTime,
    },
    ctx,
  );
  const spanId = span.spanContext().spanId;

  try {
    const code = step.conclusion === "failure" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
    span.setStatus({ code });

    core.debug(`Step Span<${spanId}>: Started<${step.started_at}>`);
    if (step.conclusion) {
      span.setAttribute("github.job.step.conclusion", step.conclusion);
    }
    await traceArtifact({
      tracer,
      jobName,
      stepName: step.name,
      workflowArtifacts,
    });
  } finally {
    core.debug(`Step Span<${spanId}>: Ended<${step.completed_at}>`);
    // Some skipped and post jobs return completed_at dates that are older than started_at
    span.end(new Date(Math.max(startTime.getTime(), completedTime.getTime())));
  }
}

type TraceArtifactParams = {
  tracer: Tracer;
  jobName: string;
  stepName: string;
  workflowArtifacts: WorkflowArtifactLookup;
};

async function traceArtifact({ tracer, jobName, stepName, workflowArtifacts }: TraceArtifactParams) {
  const artifact = workflowArtifacts(jobName, stepName);
  if (artifact) {
    core.debug(`Found Artifact ${artifact?.path}`);
    await traceOTLPFile(tracer, artifact.path);
  } else {
    core.debug(`No Artifact to trace for Job<${jobName}> Step<${stepName}>`);
  }
}

export { type TraceWorkflowRunStepParams, traceWorkflowRunStep };
