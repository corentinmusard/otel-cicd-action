import fs from "node:fs/promises";
import util from "node:util";
import { jest } from "@jest/globals";
import { RequestError } from "@octokit/request-error";
import * as core from "./__fixtures__/core";
import * as github from "./__fixtures__/github";
import type { Octokit } from "./github";
import { replayOctokit } from "./replay";

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule("@actions/core", () => core);
jest.unstable_mockModule("@actions/github", () => github);

const token = process.env["GH_TOKEN"] ?? "";

process.env["OTEL_CONSOLE_ONLY"] = "true";
process.env["OTEL_ID_SEED"] = "123"; // seed for stable otel ids generation

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import("./runner");

describe("run", () => {
  let octokit: Octokit;
  let runId: string;
  // redirect trace output to a file
  let output = "";

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
          return runId;
        case "githubToken":
          return token;
        case "extraAttributes":
          return "extra.attribute=1,key2=value2";
        default:
          return "";
      }
    });

    // ConsoleSpanExporter calls console.dir to output telemetry, so we mock it to save the output
    jest.spyOn(console, "dir").mockImplementation((item?: unknown) => {
      output += `${util.inspect(item)}\n`;
    });
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    output = "";
    core.setOutput.mockReset();
    core.setFailed.mockReset();
  });

  it("should run", async () => {
    process.env["GITHUB_REPOSITORY"] = "biomejs/biome";
    runId = "12541749172";

    await run();
    await fs.writeFile("src/__assets__/output.txt", output);

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("traceId", "329e58aa53cec7a2beadd2fd0a85c388");
  }, 10000);

  it("should fail", async () => {
    process.env["GITHUB_REPOSITORY"] = "biomejs/biome";
    runId = "111"; // does not exist

    await run();

    expect(core.setFailed).toHaveBeenCalledTimes(1);
    expect(core.setFailed).toHaveBeenCalledWith(expect.any(RequestError));
    expect(core.setOutput).not.toHaveBeenCalled();
  }, 10000);
});
