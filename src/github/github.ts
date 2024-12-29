import * as fs from "node:fs";
import * as path from "node:path";
import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import JSZip from "jszip";

type Octokit = InstanceType<typeof GitHub>;
type ListJobsForWorkflowRunType = RestEndpointMethodTypes["actions"]["listJobsForWorkflowRun"]["response"];
type WorkflowRunJob = ListJobsForWorkflowRunType["data"]["jobs"][number];
type WorkflowRun = RestEndpointMethodTypes["actions"]["getWorkflowRun"]["response"]["data"];

interface WorkflowArtifact {
  id: number;
  name: string;
}

type WorkflowArtifactMap = {
  [job: string]: {
    [step: string]: WorkflowArtifactDownload;
  };
};

type WorkflowArtifactDownload = {
  jobName: string;
  stepName: string;
  path: string;
};

type WorkflowArtifactLookup = (jobName: string, stepName: string) => WorkflowArtifactDownload | undefined;

async function listWorkflowRunArtifacts(
  context: Context,
  octokit: Octokit,
  runId: number,
): Promise<WorkflowArtifactLookup> {
  let artifactsLookup: WorkflowArtifactMap = {};

  if (runId === context.runId) {
    artifactsLookup = await getSelfArtifactMap();
  } else {
    artifactsLookup = await getWorkflowRunArtifactMap(context, octokit, runId);
  }
  return (jobName: string, stepName: string) => {
    try {
      return artifactsLookup[jobName][stepName];
    } catch (_e) {
      return undefined;
    }
  };
}

const artifactNameRegex = /\{(?<jobName>.*)\}\{(?<stepName>.*)\}/;

async function getWorkflowRunArtifactMap(context: Context, octokit: Octokit, runId: number) {
  const artifactsList: WorkflowArtifact[] = [];
  const pageSize = 100;

  for (let page = 1, hasNext = true; hasNext; page++) {
    const listArtifactsResponse = await octokit.rest.actions.listWorkflowRunArtifacts({
      ...context.repo,
      run_id: runId,
      page,
      per_page: pageSize,
    });
    artifactsList.push(...listArtifactsResponse.data.artifacts);
    hasNext = artifactsList.length < listArtifactsResponse.data.total_count;
  }

  const artifactsLookup: WorkflowArtifactMap = await artifactsList.reduce(async (resultP, artifact) => {
    const result = await resultP;
    const match = artifact.name.match(artifactNameRegex);
    const next: WorkflowArtifactMap = { ...result };
    if (match?.groups?.["jobName"] && match?.groups?.["stepName"]) {
      const { jobName, stepName } = match.groups;
      core.debug(`Found Artifact for Job<${jobName}> Step<${stepName}>`);
      if (!(jobName in next)) {
        next[jobName] = {};
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
        next[jobName][stepName] = {
          jobName,
          stepName,
          path: filename,
        };
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
        next[jobName][stepName] = {
          jobName,
          stepName,
          path: writeStream.path.toString(),
        };
      } finally {
        writeStream.close();
      }
    }

    return next;
  }, Promise.resolve({}));
  return artifactsLookup;
}

async function getSelfArtifactMap() {
  const client = artifact.create();
  const responses = await client.downloadAllArtifacts();
  const artifactsMap: WorkflowArtifactMap = responses.reduce((result, { artifactName, downloadPath }) => {
    const next: WorkflowArtifactMap = { ...result };
    const match = artifactName.match(artifactNameRegex);
    if (match?.groups?.["jobName"] && match?.groups?.["stepName"]) {
      const { jobName, stepName } = match.groups;
      core.debug(`Found Artifact for Job<${jobName}> Step<${stepName}>`);
      if (!(jobName in next)) {
        next[jobName] = {};
      }
      const artifactDirFiles = fs.readdirSync(downloadPath);
      if (artifactDirFiles && artifactDirFiles.length > 0) {
        next[jobName][stepName] = {
          jobName,
          stepName,
          path: path.join(downloadPath, artifactDirFiles[0]),
        };
      }
    }
    return next;
  }, {});

  return artifactsMap;
}

async function listJobsForWorkflowRun(context: Context, octokit: Octokit, runId: number): Promise<WorkflowRunJob[]> {
  const jobs: WorkflowRunJob[] = [];
  const pageSize = 100;

  for (let page = 1, hasNext = true; hasNext; page++) {
    const listJobsForWorkflowRunResponse = await octokit.rest.actions.listJobsForWorkflowRun({
      ...context.repo,
      run_id: runId,
      filter: "latest", // risk of missing a run if re-run happens between Action trigger and this query
      page,
      per_page: pageSize,
    });

    jobs.push(...listJobsForWorkflowRunResponse.data.jobs);
    hasNext = jobs.length < listJobsForWorkflowRunResponse.data.total_count;
  }

  return jobs;
}

type WorkflowRunJobs = {
  workflowRun: WorkflowRun;
  jobs: WorkflowRunJob[];
  workflowRunArtifacts: WorkflowArtifactLookup;
};

async function getWorkflowRunJobs(context: Context, octokit: Octokit, runId: number) {
  const getWorkflowRunResponse = await octokit.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: runId,
  });

  const workflowRunArtifacts = await listWorkflowRunArtifacts(context, octokit, runId);
  const jobs = await listJobsForWorkflowRun(context, octokit, runId);

  const workflowRunJobs: WorkflowRunJobs = {
    workflowRun: getWorkflowRunResponse.data,
    jobs,
    workflowRunArtifacts,
  };
  return workflowRunJobs;
}

async function getPRLabels(context: Context, octokit: Octokit, prNumber: number) {
  const labelResponse = await octokit.rest.issues.listLabelsOnIssue({
    ...context.repo,
    issue_number: prNumber,
  });
  return labelResponse.data.map((l) => l.name);
}

async function getPRsLabels(context: Context, octokit: Octokit, prNumbers: number[]) {
  const labels: Record<number, string[]> = {};

  for (const prNumber of prNumbers) {
    labels[prNumber] = await getPRLabels(context, octokit, prNumber);
  }
  return labels;
}

export {
  getWorkflowRunJobs,
  listWorkflowRunArtifacts,
  getPRLabels,
  getPRsLabels,
  type Octokit,
  type WorkflowArtifact,
  type WorkflowArtifactDownload,
  type WorkflowArtifactLookup,
  type WorkflowRunJob,
  type WorkflowRunJobs,
};
