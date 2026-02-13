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

async function loadRunner() {
  return await import("./runner");
}

describe("isOctokitError", () => {
  it("returns true", async () => {
    const { isOctokitError } = await import("./runner");
    const err = new RequestError("this is an error", 400, {
      request: {
        method: "GET",
        url: "http://example.com",
        headers: {},
      },
    });
    expect(isOctokitError(err)).toBe(true);
  });
  it("returns false", async () => {
    const { isOctokitError } = await import("./runner");
    expect(isOctokitError("")).toBe(false);
  });
});

describe("run", () => {
  let octokit: Octokit;
  let runId: string;
  // redirect trace output to a file
  let output = "";
  let run: typeof import("./runner").run;

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

    ({ run } = await loadRunner());
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
    expect(output).toContain("lead_time.first_commit_at");
    expect(output).toContain("lead_time.pr_created_at");
    expect(output).toContain("lead_time.pr_merged_at");
    expect(output).toContain("lead_time.workflow_finished_at");
    expect(output).toContain("lead_time.metric_emitted");
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

describe("run branches", () => {
  const workflowRunBase = {
    id: 1,
    workflow_id: 2,
    run_attempt: 1,
    repository: { full_name: "acme/repo" },
    head_sha: "deadbeef",
    name: "test",
  };

  function setInputs() {
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case "otlpEndpoint":
        case "otlpHeaders":
          return "";
        case "otelServiceName":
          return "otel-cicd-action";
        case "runId":
          return "1";
        case "githubToken":
          return "";
        case "extraAttributes":
          return "";
        default:
          return "";
      }
    });
  }

  async function setupRunner(overrides: Record<string, unknown> = {}) {
    jest.resetModules();
    jest.unstable_mockModule("@actions/core", () => core);
    jest.unstable_mockModule("@actions/github", () => github);

    const traceWorkflowRun = jest.fn(() => "trace-id");
    const recordWorkflowMetrics = jest.fn();
    const tracerProvider = { forceFlush: jest.fn(), shutdown: jest.fn() };
    const meterProvider = { forceFlush: jest.fn(), shutdown: jest.fn() };

    const githubApi: Record<string, unknown> = {
      getWorkflowRun: jest.fn(async () => ({ ...workflowRunBase, pull_requests: [] })),
      listJobsForWorkflowRun: jest.fn(async () => []),
      getJobsAnnotations: jest.fn(async () => ({})),
      getPRsLabels: jest.fn(async () => ({})),
      getPullRequest: jest.fn(async () => ({ created_at: "2026-02-01T00:00:00Z" })),
      listPullRequestCommits: jest.fn(async () => []),
      listPullRequestReviews: jest.fn(async () => []),
      listPullRequestEvents: jest.fn(async () => []),
      ...overrides,
    };

    jest.unstable_mockModule("./github", () => githubApi);
    jest.unstable_mockModule("./trace/workflow", () => ({ traceWorkflowRun }));
    jest.unstable_mockModule("./metrics/workflow", () => ({ recordWorkflowMetrics }));
    jest.unstable_mockModule("./tracer", () => ({
      createTracerProvider: jest.fn(() => tracerProvider),
      stringToRecord: jest.fn(() => ({})),
    }));
    jest.unstable_mockModule("./meter", () => ({
      createMeterProvider: jest.fn(() => meterProvider),
    }));

    const { run } = await import("./runner");
    return { run, githubApi, traceWorkflowRun, recordWorkflowMetrics };
  }

  afterEach(() => {
    core.getInput.mockReset();
    core.info.mockReset();
    core.setOutput.mockReset();
    core.setFailed.mockReset();
    github.getOctokit.mockReset();
  });

  it("skips labels lookup when no PRs", async () => {
    setInputs();
    github.getOctokit.mockReturnValue({} as Octokit);

    const { run, githubApi, recordWorkflowMetrics } = await setupRunner({
      getWorkflowRun: jest.fn(async () => ({ ...workflowRunBase, pull_requests: [] })),
    });

    await run();

    expect(githubApi["getPRsLabels"] as jest.Mock).not.toHaveBeenCalled();
    expect(recordWorkflowMetrics).not.toHaveBeenCalled();
  });

  it("logs and continues when PR labels fail", async () => {
    setInputs();
    github.getOctokit.mockReturnValue({} as Octokit);

    const err = new RequestError("labels failed", 403, { request: { method: "GET", url: "", headers: {} } });
    const { run } = await setupRunner({
      getWorkflowRun: jest.fn(async () => ({
        ...workflowRunBase,
        pull_requests: [{ number: 1 }],
      })),
      getPRsLabels: jest.fn(() => Promise.reject(err)),
    });

    await run();

    expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Failed to get PR labels"));
  });

  it("returns null PR data when PR fetch fails", async () => {
    setInputs();
    github.getOctokit.mockReturnValue({} as Octokit);

    const err = new RequestError("pr failed", 404, { request: { method: "GET", url: "", headers: {} } });
    const { run, recordWorkflowMetrics } = await setupRunner({
      getWorkflowRun: jest.fn(async () => ({
        ...workflowRunBase,
        pull_requests: [{ number: 2 }],
      })),
      getPullRequest: jest.fn(() => Promise.reject(err)),
    });

    await run();

    expect(recordWorkflowMetrics).toHaveBeenCalledWith(expect.any(Object), null, null);
  });

  it("captures earliest approval and ready_for_review", async () => {
    setInputs();
    github.getOctokit.mockReturnValue({} as Octokit);

    const { run, traceWorkflowRun } = await setupRunner({
      getWorkflowRun: jest.fn(async () => ({
        ...workflowRunBase,
        pull_requests: [{ number: 3 }],
      })),
      listPullRequestReviews: jest.fn(async () => [
        { state: "COMMENTED", submitted_at: "2026-02-01T00:00:00Z" },
        { state: "APPROVED", submitted_at: null },
        { state: "APPROVED", submitted_at: "2026-02-02T00:00:00Z" },
        { state: "APPROVED", submitted_at: "2026-01-30T00:00:00Z" },
      ]),
      listPullRequestEvents: jest.fn(async () => [
        { event: "labeled", created_at: "2026-01-01T00:00:00Z" },
        { event: "ready_for_review", created_at: null },
        { event: "ready_for_review", created_at: "2026-02-01T00:00:00Z" },
        { event: "ready_for_review", created_at: "2026-01-31T00:00:00Z" },
      ]),
    });

    await run();

    const prs = (traceWorkflowRun as jest.Mock).mock.calls[0]?.[3] as
      | Array<{ firstApprovedAt?: string | null; readyForReviewAt?: string | null }>
      | undefined;
    expect(prs).toBeDefined();
    expect(prs?.[0]?.firstApprovedAt).toBe("2026-01-30T00:00:00Z");
    expect(prs?.[0]?.readyForReviewAt).toBe("2026-01-31T00:00:00Z");
  });
});
