import { type FileHandle, appendFile, mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as readline from "node:readline";
import { getOctokit } from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { Octokit } from "@octokit/rest";
import type { OctokitResponse } from "@octokit/types";
import callerCallsite from "caller-callsite";

async function recordOctokit(name: string, token: string) {
  const folder = join(dirname(callerCallsite()?.getFileName() ?? ""), "__assets__");
  const fileName = join(folder, `${name}.rec`);

  // Create the folder if it doesn't exist
  await mkdir(folder, { recursive: true });

  // create and truncate
  const file = await open(fileName, "w");

  const octokit = getOctokit(token);

  octokit.hook.wrap("request", async (request, options) => {
    const response = await request(options);
    await writeReplay(file, {
      path: options.url,
      url: response.url,
      status: response.status,
      data: response.data,
    });

    return response;
  });

  return octokit;
}

interface Replay {
  path: string;
  url: string;
  status: number;
  data: unknown;
}

async function writeReplay(path: FileHandle, replay: Replay) {
  const jsonData = JSON.stringify(replay.data);
  const base64Data = Buffer.from(jsonData).toString("base64");

  await appendFile(path, `${replay.path}\n`);
  await appendFile(path, `${replay.url}\n`);
  await appendFile(path, `${replay.status}\n`);
  await appendFile(path, `${base64Data}\n`);
}

async function replayOctokit(name: string, token: string) {
  if (process.env["RECORD_OCTOKIT"] === "true") {
    return recordOctokit(name, token);
  }

  const folder = join(dirname(callerCallsite()?.getFileName() ?? ""), "__assets__");
  const fileName = join(folder, `${name}.rec`);

  const file = await open(fileName, "r");
  const rl = readline.createInterface({
    input: file.createReadStream(),
  });

  const octokit = new Octokit() as unknown as InstanceType<typeof GitHub>;

  octokit.hook.wrap("request", async (_, options) => {
    const replay = await readReplay(rl);

    if (options.url !== replay.path) {
      return Promise.reject(
        new Error(`replay: request order changed: called with ${options.url} but replay has ${replay.path}`),
      );
    }

    const response: OctokitResponse<unknown> = {
      headers: {},
      status: replay.status,
      url: replay.url,
      data: replay.data,
    };
    return response;
  });

  return octokit;
}

async function readReplay(rl: readline.Interface) {
  const lines: string[] = [];
  for await (const line of rl) {
    lines.push(line);
    if (lines.length === 4) {
      break;
    }
  }

  if (lines.length !== 4) {
    throw new Error("replay: number of requests changed: unexpected end of file");
  }

  const replay: Replay = {
    path: lines[0],
    url: lines[1],
    status: Number.parseInt(lines[2]),
    data: JSON.parse(Buffer.from(lines[3], "base64").toString()),
  };
  return replay;
}

export { recordOctokit, replayOctokit };
