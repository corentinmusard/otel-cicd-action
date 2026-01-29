import { appendFile, type FileHandle, mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as readline from "node:readline";
import { getOctokit } from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import type { OctokitResponse, RequestMethod } from "@octokit/types";
import callerCallsite from "caller-callsite";

function isOctokitError(err: unknown): err is RequestError {
  return !!err && typeof err === "object" && "status" in err;
}

async function recordOctokit(name: string, token: string) {
  const folder = join(dirname(callerCallsite()?.getFileName() ?? ""), "__assets__");
  const fileName = join(folder, `${name}.rec`);

  // Create the folder if it doesn't exist
  await mkdir(folder, { recursive: true });

  // create and truncate
  const file = await open(fileName, "w");

  const octokit = getOctokit(token);

  octokit.hook.wrap("request", async (request, options) => {
    try {
      const response = await request(options);
      await writeReplay(file, {
        method: options.method,
        path: options.url,
        url: response.url,
        status: response.status,
        data: response.data,
      });

      return response;
    } catch (error) {
      if (isOctokitError(error)) {
        await writeReplay(file, {
          method: options.method,
          path: options.url,
          url: error.response?.url ?? "",
          status: error.response?.status ?? 0,
          data: error.response?.data,
        });
      }
      throw error;
    }
  });

  return octokit;
}

interface Replay {
  method: RequestMethod;
  path: string;
  url: string;
  status: number;
  data: unknown;
}

async function writeReplay(path: FileHandle, replay: Replay) {
  const jsonData = JSON.stringify(replay.data);
  const base64Data = Buffer.from(jsonData).toString("base64");

  await appendFile(path, `${replay.method}\n`);
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

    if (options.url !== replay.path || options.method !== replay.method) {
      return Promise.reject(
        new Error(
          `replay: request order changed: called with ${options.method} ${options.url} but replay has ${replay.method} ${replay.path}`
        )
      );
    }

    const response: OctokitResponse<unknown> = {
      headers: {},
      status: replay.status,
      url: replay.url,
      data: replay.data,
    };

    if (replay.status >= 400 && replay.status < 600) {
      const error = replay.data as { message: string; documentation_url: string };
      throw new RequestError(`${error?.message} - ${error?.documentation_url}`, replay.status, {
        response,
        request: {
          method: replay.method,
          url: replay.path,
          headers: {},
        },
      });
    }

    return response;
  });

  return octokit;
}

async function readReplay(rl: readline.Interface): Promise<Replay> {
  const lines: string[] = [];
  lines.push(await oneLine(rl));
  lines.push(await oneLine(rl));
  lines.push(await oneLine(rl));
  lines.push(await oneLine(rl));
  lines.push(await oneLine(rl));

  return {
    method: lines[0] as RequestMethod,
    path: lines[1],
    url: lines[2],
    status: Number.parseInt(lines[3], 10),
    data: JSON.parse(Buffer.from(lines[4], "base64").toString()),
  };
}

async function oneLine(rl: readline.Interface) {
  const iter = rl[Symbol.asyncIterator]();

  const { done, value } = await iter.next();
  if (done) {
    throw new Error("replay: number of requests changed: unexpected end of file");
  }
  return value;
}

export { recordOctokit, replayOctokit };
