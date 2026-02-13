import fs from "node:fs/promises";
import util, { type InspectOptions } from "node:util";
import { jest } from "@jest/globals";
import { RequestError } from "@octokit/request-error";
import { trace } from "@opentelemetry/api";
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
const { run, isOctokitError } = await import("./runner");

describe("isOctokitError", () => {
  it("returns true", () => {
    const err = new RequestError("this is an error", 400, {
      request: {
        method: "GET",
        url: "http://example.com",
        headers: {},
      },
    });
    expect(isOctokitError(err)).toBe(true);
  });
  it("returns false", () => {
    expect(isOctokitError("")).toBe(false);
  });
});

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
    // See: https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-base/src/export/ConsoleSpanExporter.ts
    jest.spyOn(console, "dir").mockImplementation((item: unknown, options?: InspectOptions) => {
      output += `${util.inspect(item, options)}\n`;
    });
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    trace.disable(); // Remove the global tracer provider
    output = "";
    core.setOutput.mockReset();
    core.setFailed.mockReset();
  });

  it("should run a successful workflow", async () => {
    // https://github.com/biomejs/biome/actions/runs/21983564823
    process.env["GITHUB_REPOSITORY"] = "biomejs/biome";
    runId = "21983564823";

    await run();
    await fs.writeFile("src/__assets__/output_success.txt", output);

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("traceId", "329e58aa53cec7a2beadd2fd0a85c388");
    expect(output).toContain("github.pull_request.lead_time");
    expect(output).toContain("lead_time.pr_created_ms");
    expect(output).toContain("lead_time.pr_ready_for_review_ms");
    expect(output).toContain("lead_time.pr_approved_ms");
    expect(output).toContain("lead_time.pr_merged_ms");
    expect(output).toContain("lead_time.workflow_finished_ms");
    expect(output).toContain("lead_time.total_ms");
  }, 10_000);

  it("should run a failed workflow", async () => {
    // https://github.com/biomejs/biome/actions/runs/21458831126
    process.env["GITHUB_REPOSITORY"] = "biomejs/biome";
    runId = "21458831126";

    await run();
    await fs.writeFile("src/__assets__/output_failed.txt", output);

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("traceId", "329e58aa53cec7a2beadd2fd0a85c388");
  }, 10_000);

  it("should run a cancelled workflow", async () => {
    // https://github.com/step-security/skip-duplicate-actions/actions/runs/16620109074?pr=305
    process.env["GITHUB_REPOSITORY"] = "step-security/skip-duplicate-actions";
    runId = "16620109074";

    await run();
    await fs.writeFile("src/__assets__/output_cancelled.txt", output);

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("traceId", "329e58aa53cec7a2beadd2fd0a85c388");
  }, 10_000);

  it("should fail", async () => {
    // https://github.com/corentinmusard/otel-cicd-action/actions/runs/111
    process.env["GITHUB_REPOSITORY"] = "corentinmusard/otel-cicd-action";
    runId = "111"; // does not exist

    await run();

    expect(output).toBe("");
    expect(core.setFailed).toHaveBeenCalledTimes(1);
    expect(core.setFailed).toHaveBeenCalledWith(expect.any(Error));
    expect(core.setOutput).not.toHaveBeenCalled();
  }, 10_000);
});
