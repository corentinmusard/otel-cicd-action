"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetPRLabels = exports.getWorkflowRunJobs = exports.listWorkflowRunArtifacts = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const JSZip = __importStar(require("jszip"));
const fs = __importStar(require("fs"));
const artifact = __importStar(require("@actions/artifact"));
const path = __importStar(require("path"));
async function listWorkflowRunArtifacts(context, octokit, runId) {
    let artifactsLookup = {};
    /* istanbul ignore if */
    if (runId === context.runId) {
        artifactsLookup = await getSelfArtifactMap();
    }
    else {
        artifactsLookup = await getWorkflowRunArtifactMap(context, octokit, runId);
    }
    return (jobName, stepName) => {
        try {
            return artifactsLookup[jobName][stepName];
        }
        catch (e) {
            /* istanbul ignore next */
            return undefined;
        }
    };
}
exports.listWorkflowRunArtifacts = listWorkflowRunArtifacts;
async function getWorkflowRunArtifactMap(context, octokit, runId) {
    const artifactsList = [];
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
    const artifactsLookup = await artifactsList.reduce(async (resultP, artifact) => {
        const result = await resultP;
        const match = artifact.name.match(/\{(?<jobName>.*)\}\{(?<stepName>.*)\}/);
        const next = { ...result };
        /* istanbul ignore next */
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
            const response = await fetch(downloadResponse.url);
            const buf = await response.arrayBuffer();
            const zip = await JSZip.loadAsync(buf);
            const writeStream = fs.createWriteStream(`${artifact.name}.log`);
            try {
                zip.files[Object.keys(zip.files)[0]].nodeStream().pipe(writeStream);
                await new Promise((fulfill) => writeStream.on("finish", fulfill));
                core.debug(`Downloaded Artifact ${writeStream.path.toString()}`);
                next[jobName][stepName] = {
                    jobName,
                    stepName,
                    path: writeStream.path.toString(),
                };
            }
            finally {
                writeStream.close();
            }
        }
        return next;
    }, Promise.resolve({}));
    return artifactsLookup;
}
/* istanbul ignore next */
async function getSelfArtifactMap() {
    const client = artifact.create();
    const responses = await client.downloadAllArtifacts();
    const artifactsMap = responses.reduce((result, { artifactName, downloadPath }) => {
        const next = { ...result };
        const match = artifactName.match(/\{(?<jobName>.*)\}\{(?<stepName>.*)\}/);
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
// TODO add test coverage
/* istanbul ignore next */
async function listJobsForWorkflowRun(context, octokit, runId) {
    const jobs = [];
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
// TODO add test coverage
/* istanbul ignore next */
async function getWorkflowRunJobs(context, octokit, runId) {
    const getWorkflowRunResponse = await octokit.rest.actions.getWorkflowRun({
        ...context.repo,
        run_id: runId,
    });
    const workflowRunArtifacts = await listWorkflowRunArtifacts(context, octokit, runId);
    const jobs = await listJobsForWorkflowRun(context, octokit, runId);
    const workflowRunJobs = {
        workflowRun: getWorkflowRunResponse.data,
        jobs,
        workflowRunArtifacts,
    };
    return workflowRunJobs;
}
exports.getWorkflowRunJobs = getWorkflowRunJobs;
async function GetPRLabels(owner, repo, prNumber) {
    const octokit = (0, github_1.getOctokit)(core.getInput("githubToken"));
    const labelRequest = await octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: prNumber,
    });
    return labelRequest.data.map((l) => l.name).join(", ");
}
exports.GetPRLabels = GetPRLabels;
//# sourceMappingURL=github.js.map