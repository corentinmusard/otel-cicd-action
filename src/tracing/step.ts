import * as core from "@actions/core";
import type { components } from "@octokit/openapi-types";
import { type Attributes, SpanStatusCode, trace } from "@opentelemetry/api";
import type { WorkflowArtifactLookup } from "../github/github";
import { traceOTLPFile } from "./trace-otlp-file";

const tracer = trace.getTracer("otel-cicd-action");

type Step = NonNullable<components["schemas"]["job"]["steps"]>[number];

async function traceStep(jobName: string, step: Step, workflowArtifacts: WorkflowArtifactLookup) {
  if (!step.completed_at || !step.started_at) {
    core.warning(`Step ${step.name} is not completed yet.`);
    return;
  }

  if (step.conclusion === "cancelled" || step.conclusion === "skipped") {
    core.info(`Step ${step.name} did not run.`);
    return;
  }

  const startTime = new Date(step.started_at);
  const completedTime = new Date(step.completed_at);
  const attributes = stepToAttributes(step);

  await tracer.startActiveSpan(step.name, { attributes, startTime }, async (span) => {
    const code = step.conclusion === "failure" ? SpanStatusCode.ERROR : SpanStatusCode.OK;
    span.setStatus({ code });

    await traceArtifact(jobName, step.name, workflowArtifacts);

    // Some skipped and post jobs return completed_at dates that are older than started_at
    span.end(new Date(Math.max(startTime.getTime(), completedTime.getTime())));
  });
}

function stepToAttributes(step: Step): Attributes {
  return {
    "github.job.step.status": step.status,
    "github.job.step.conclusion": step.conclusion ?? undefined,
    "github.job.step.name": step.name,
    "github.job.step.number": step.number,
    "github.job.step.started_at": step.started_at ?? undefined,
    "github.job.step.completed_at": step.completed_at ?? undefined,
    error: step.conclusion === "failure",
  };
}

async function traceArtifact(jobName: string, stepName: string, workflowArtifacts: WorkflowArtifactLookup) {
  const artifact = workflowArtifacts(jobName, stepName);
  if (!artifact) {
    core.debug(`No artifact to trace for Job<${jobName}> Step<${stepName}>`);
    return;
  }

  core.debug(`Found artifact ${artifact?.path}`);
  try {
    await traceOTLPFile(artifact.path);
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`Failed to trace artifact ${artifact.path}: ${error.message}`);
    }
  }
}

export { traceStep };
