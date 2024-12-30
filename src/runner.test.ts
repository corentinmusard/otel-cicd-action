import fs from "node:fs/promises";
import util from "node:util";
import { jest } from "@jest/globals";
import * as core from "./__fixtures__/core";
import * as github from "./__fixtures__/github";
import type { Octokit } from "./github/github";
import { replayOctokit } from "./replay";

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);

const token = process.env["GH_TOKEN"] ?? "";
const owner = "biomejs";
const repo = "biome";

process.env["OTEL_CONSOLE_ONLY"] = "true";
process.env["OTEL_ID_SEED"] = "123"; // seed for random id generation
process.env["GITHUB_REPOSITORY"] = `${owner}/${repo}`;

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import("./runner");

describe("run", () => {
  let octokit: Octokit;

  beforeAll(async () => {
    octokit = await replayOctokit("run", token);

    github.getOctokit.mockReturnValue(octokit);

    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case "otlpEndpoint":
          return "";
        case "otlpHeaders":
          return "";
        case "otelServiceName":
          return "otel-cicd-action";
        case "runId":
          return "12541749172";
        case "githubToken":
          return token;
        default:
          return "";
      }
    });
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  it("should run without artifacts", async () => {
    // redirect trace output to a file
    let output = "";
    // biome-ignore lint/suspicious/noExplicitAny: any is used to mock console.dir
    const dir = jest.spyOn(console, "dir").mockImplementation((item?: any) => {
      output += `${util.inspect(item)}\n`;
    });

    await run();
    await fs.writeFile("src/__assets__/output.txt", output);

    dir.mockRestore();
  }, 10000);
});
