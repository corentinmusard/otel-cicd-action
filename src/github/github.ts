import * as fs from "node:fs";
import * as path from "node:path";
import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import JSZip from "jszip";

type Octokit = InstanceType<typeof GitHub>;

type JobName = string;
type StepName = string;
type ArtifactPath = string;

type StepArtifactMap = Map<StepName, ArtifactPath>;
type JobArtifactMap = Map<JobName, StepArtifactMap>;

async function listWorkflowRunArtifacts(context: Context, octokit: Octokit, runId: number) {
  return runId === context.runId
    ? await getSelfArtifactMap()
    : await getWorkflowRunArtifactMap(context, octokit, runId);
}

const artifactNameRegex = /\{(?<jobName>.*)\}\{(?<stepName>.*)\}/;

async function getWorkflowRunArtifactMap(context: Context, octokit: Octokit, runId: number) {
  const artifacts = await octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
    ...context.repo,
    run_id: runId,
    per_page: 100,
  });

  return await artifacts.reduce(async (resultP: Promise<JobArtifactMap>, artifact) => {
    const next = await resultP;
    const match = artifact.name.match(artifactNameRegex);
    if (match?.groups?.["jobName"] && match?.groups?.["stepName"]) {
      const { jobName, stepName } = match.groups;
      core.debug(`Found Artifact for Job<${jobName}> Step<${stepName}>`);
      if (!next.has(jobName)) {
        next.set(jobName, new Map());
      }

      const downloadResponse = await octokit.rest.actions.downloadArtifact({
        ...context.repo,
        artifact_id: artifact.id,
        archive_format: "zip",
      });

      const filename = `${artifact.name}.log`;

      // if file exists already, skip fetching artifact
      // useful for testing because the artifact url expires after 1 minute
      if (fs.existsSync(`${artifact.name}.log`)) {
        core.debug(`Artifact ${artifact.name} already exists, skipping download`);
        next.get(jobName)?.set(stepName, filename);
        return next;
      }

      const response = await fetch(downloadResponse.url);
      const buf = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const writeStream = fs.createWriteStream(filename);
      try {
        zip.files[Object.keys(zip.files)[0]].nodeStream().pipe(writeStream);
        await new Promise((fulfill) => writeStream.on("finish", fulfill));
        core.debug(`Downloaded Artifact ${writeStream.path.toString()}`);
        next.get(jobName)?.set(stepName, writeStream.path.toString());
      } finally {
        writeStream.close();
      }
    }

    return next;
  }, Promise.resolve(new Map()));
}

async function getSelfArtifactMap() {
  const client = artifact.create();
  const responses = await client.downloadAllArtifacts();

  return responses.reduce((result: JobArtifactMap, { artifactName, downloadPath }) => {
    const next = result;
    const match = artifactName.match(artifactNameRegex);
    if (match?.groups?.["jobName"] && match?.groups?.["stepName"]) {
      const { jobName, stepName } = match.groups;
      core.debug(`Found Artifact for Job<${jobName}> Step<${stepName}>`);
      if (!next.has(jobName)) {
        next.set(jobName, new Map());
      }

      const artifactDirFiles = fs.readdirSync(downloadPath);
      if (artifactDirFiles.length > 0) {
        next.get(jobName)?.set(stepName, path.join(downloadPath, artifactDirFiles[0]));
      }
    }
    return next;
  }, new Map());
}

async function getWorkflowRun(context: Context, octokit: Octokit, runId: number) {
  const res = await octokit.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: runId,
  });
  return res.data;
}

async function listJobsForWorkflowRun(context: Context, octokit: Octokit, runId: number) {
  return await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
    ...context.repo,
    run_id: runId,
    filter: "latest", // risk of missing a run if re-run happens between Action trigger and this query
    per_page: 100,
  });
}

async function getPRsLabels(context: Context, octokit: Octokit, prNumbers: number[]) {
  const labels: Record<number, string[]> = {};

  for (const prNumber of prNumbers) {
    labels[prNumber] = await getPRLabels(context, octokit, prNumber);
  }
  return labels;
}

async function getPRLabels(context: Context, octokit: Octokit, prNumber: number) {
  return await octokit.paginate(
    octokit.rest.issues.listLabelsOnIssue,
    {
      ...context.repo,
      issue_number: prNumber,
    },
    (response) => response.data.map((issue) => issue.name),
  );
}

export {
  getWorkflowRun,
  listWorkflowRunArtifacts,
  listJobsForWorkflowRun,
  getPRLabels,
  getPRsLabels,
  type Octokit,
  type StepArtifactMap,
  type JobArtifactMap,
};
