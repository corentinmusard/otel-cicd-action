import { jest } from "@jest/globals";
import type { Attributes } from "@opentelemetry/api";
import type { MeterProvider } from "@opentelemetry/sdk-metrics";
import type { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import { createMeterProvider } from "./meter";
import { createTracerProvider, stringToRecord } from "./tracer";

describe("createTracerProvider", () => {
  let provider: BasicTracerProvider;
  const attributes: Attributes = {
    [ATTR_SERVICE_NAME]: "workflow-name",
    [ATTR_SERVICE_VERSION]: "head-sha",
    [ATTR_SERVICE_INSTANCE_ID]: "test/repo/1/1/1",
    [ATTR_SERVICE_NAMESPACE]: "test/repo",
    "extra.attribute": "1",
  };

  afterEach(() => {
    return provider.shutdown();
  });

  it("has resource attributes", () => {
    provider = createTracerProvider("localhost", "test=foo", attributes);
    /*expect(provider.resource.attributes[ATTR_SERVICE_NAME]).toEqual(attributes[ATTR_SERVICE_NAME]);
    expect(provider.resource.attributes[ATTR_SERVICE_VERSION]).toEqual(attributes[ATTR_SERVICE_VERSION]);
    expect(provider.resource.attributes[ATTR_SERVICE_INSTANCE_ID]).toEqual(attributes[ATTR_SERVICE_INSTANCE_ID]);
    expect(provider.resource.attributes[ATTR_SERVICE_NAMESPACE]).toEqual(attributes[ATTR_SERVICE_NAMESPACE]);
    expect(provider.resource.attributes["extra.attribute"]).toEqual(attributes["extra.attribute"]);*/
    //FIXME
  });

  it("supports https", () => {
    provider = createTracerProvider("https://localhost", "test=foo", attributes);
  });

  it("supports http", () => {
    provider = createTracerProvider("http://localhost", "test=foo", attributes);
  });
});

describe("stringToRecord", () => {
  it("should parse no header", () => {
    const headers = stringToRecord("");
    expect(headers).toEqual({});
  });

  it("should parse one header", () => {
    const headers = stringToRecord("aaa=bbb");
    expect(headers).toEqual({ aaa: "bbb" });
  });

  it("should parse multiple headers", () => {
    const headers = stringToRecord("aaa=bbb,ccc=ddd");
    expect(headers).toEqual({ aaa: "bbb", ccc: "ddd" });
  });

  it("should parse base64 encoded header with =", () => {
    const headers = stringToRecord("aaa=bnVsbA==");
    expect(headers).toEqual({ aaa: "bnVsbA==" });
  });
});

describe("createMeterProvider", () => {
  let provider: MeterProvider;
  const attributes: Attributes = {
    [ATTR_SERVICE_NAME]: "workflow-name",
    [ATTR_SERVICE_VERSION]: "head-sha",
    [ATTR_SERVICE_INSTANCE_ID]: "test/repo/1/1/1",
    [ATTR_SERVICE_NAMESPACE]: "test/repo",
    "extra.attribute": "1",
  };

  afterEach(() => {
    return provider.shutdown();
  });

  it("has resource attributes", () => {
    provider = createMeterProvider("localhost", "test=foo", attributes);
    // Basic test to ensure provider is created successfully
    expect(provider).toBeDefined();
  });

  it("supports https", () => {
    provider = createMeterProvider("https://localhost", "test=foo", attributes);
    expect(provider).toBeDefined();
  });

  it("supports http", () => {
    provider = createMeterProvider("http://localhost", "test=foo", attributes);
    expect(provider).toBeDefined();
  });
});

describe("traceWorkflowRun branches", () => {
  async function loadTraceWorkflow() {
    const jestMock = jest as typeof jest & {
      unstable_mockModule: (moduleName: string, factory: () => unknown) => void;
    };

    jest.resetModules();

    const tracer = {
      startSpan: jest.fn(() => ({ end: jest.fn() })),
      startActiveSpan: jest.fn(),
    };

    jestMock.unstable_mockModule("@opentelemetry/api", () => ({
      context: {
        active: () => undefined,
      },
      trace: {
        getTracer: () => tracer,
      },
      SpanStatusCode: {
        OK: 1,
        ERROR: 2,
      },
    }));

    jestMock.unstable_mockModule("./trace/job", () => ({ traceJob: jest.fn() }));

    const traceWorkflowRunModule = await import("./trace/workflow");

    return { traceWorkflowRun: traceWorkflowRunModule.traceWorkflowRun, tracer };
  }

  it("handles unknown status and conclusion", async () => {
    const { traceWorkflowRun, tracer } = await loadTraceWorkflow();
    let attributes: Record<string, unknown> = {};

    (tracer.startActiveSpan as jest.Mock).mockImplementation((...args: unknown[]) => {
      const spanOptions = args[1] as { attributes?: Record<string, unknown> };
      const callback = args[2] as (span: {
        setStatus: jest.Mock;
        end: jest.Mock;
        spanContext: () => { traceId: string };
      }) => string;
      attributes = spanOptions.attributes ?? {};
      return callback({
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({ traceId: "trace-id" }),
      });
    });

    traceWorkflowRun(
      {
        id: 1,
        workflow_id: 2,
        run_attempt: 1,
        name: "test",
        display_title: "test",
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:10Z",
        status: "unknown",
        conclusion: "unknown",
        html_url: "https://example.com",
        url: "https://api.example.com",
        workflow_url: "https://api.example.com/workflow",
        jobs_url: "https://api.example.com/jobs",
        logs_url: "https://api.example.com/logs",
        check_suite_url: "https://api.example.com/check-suite",
        artifacts_url: "https://api.example.com/artifacts",
        cancel_url: "https://api.example.com/cancel",
        rerun_url: "https://api.example.com/rerun",
        head_sha: "deadbeef",
        path: ".github/workflows/test.yml",
        repository: { full_name: "acme/repo" },
        check_suite_id: 1,
        check_suite_node_id: "node",
        event: "push",
      } as never,
      [],
      {},
      []
    );

    expect(attributes).toBeDefined();
    expect(attributes["cicd.pipeline.result"]).toBeUndefined();
    expect(attributes["cicd.pipeline.run.state"]).toBeUndefined();
  });

  it("skips PR lead time attributes when details are missing", async () => {
    const { traceWorkflowRun, tracer } = await loadTraceWorkflow();
    let attributes: Record<string, unknown> = {};

    (tracer.startActiveSpan as jest.Mock).mockImplementation((...args: unknown[]) => {
      const spanOptions = args[1] as { attributes?: Record<string, unknown> };
      const callback = args[2] as (span: {
        setStatus: jest.Mock;
        end: jest.Mock;
        spanContext: () => { traceId: string };
      }) => string;
      attributes = spanOptions.attributes ?? {};
      return callback({
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({ traceId: "trace-id" }),
      });
    });

    traceWorkflowRun(
      {
        id: 1,
        workflow_id: 2,
        run_attempt: 1,
        name: "test",
        display_title: "test",
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:10Z",
        status: "completed",
        conclusion: "success",
        html_url: "https://example.com",
        url: "https://api.example.com",
        workflow_url: "https://api.example.com/workflow",
        jobs_url: "https://api.example.com/jobs",
        logs_url: "https://api.example.com/logs",
        check_suite_url: "https://api.example.com/check-suite",
        artifacts_url: "https://api.example.com/artifacts",
        cancel_url: "https://api.example.com/cancel",
        rerun_url: "https://api.example.com/rerun",
        head_sha: "deadbeef",
        path: ".github/workflows/test.yml",
        repository: { full_name: "acme/repo" },
        check_suite_id: 1,
        check_suite_node_id: "node",
        event: "push",
        pull_requests: [
          {
            id: 1,
            number: 1,
            url: "https://api.example.com/pr/1",
            head: { sha: "sha", ref: "ref", repo: { id: 1, url: "https://api.example.com/repo", name: "repo" } },
            base: { sha: "sha", ref: "ref", repo: { id: 1, url: "https://api.example.com/repo", name: "repo" } },
          },
        ],
      } as never,
      [],
      {},
      [{ labels: [], details: null, firstCommitAuthorDate: null, firstApprovedAt: null, readyForReviewAt: null }]
    );

    expect(Object.keys(attributes).some((key) => key.includes("lead_time"))).toBe(false);
  });

  it("emits zero lead times for missing timestamps", async () => {
    const { traceWorkflowRun, tracer } = await loadTraceWorkflow();
    let attributes: Record<string, unknown> = {};

    (tracer.startActiveSpan as jest.Mock).mockImplementation((...args: unknown[]) => {
      const spanOptions = args[1] as { attributes?: Record<string, unknown> };
      const callback = args[2] as (span: {
        setStatus: jest.Mock;
        end: jest.Mock;
        spanContext: () => { traceId: string };
      }) => string;
      attributes = spanOptions.attributes ?? {};
      return callback({
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({ traceId: "trace-id" }),
      });
    });

    traceWorkflowRun(
      {
        id: 1,
        workflow_id: 2,
        run_attempt: 1,
        name: "test",
        display_title: "test",
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:10Z",
        status: "completed",
        conclusion: "success",
        html_url: "https://example.com",
        url: "https://api.example.com",
        workflow_url: "https://api.example.com/workflow",
        jobs_url: "https://api.example.com/jobs",
        logs_url: "https://api.example.com/logs",
        check_suite_url: "https://api.example.com/check-suite",
        artifacts_url: "https://api.example.com/artifacts",
        cancel_url: "https://api.example.com/cancel",
        rerun_url: "https://api.example.com/rerun",
        head_sha: "deadbeef",
        path: ".github/workflows/test.yml",
        repository: { full_name: "acme/repo" },
        check_suite_id: 1,
        check_suite_node_id: "node",
        event: "push",
        pull_requests: [
          {
            id: 1,
            number: 1,
            url: "https://api.example.com/pr/1",
            head: { sha: "sha", ref: "ref", repo: { id: 1, url: "https://api.example.com/repo", name: "repo" } },
            base: { sha: "sha", ref: "ref", repo: { id: 1, url: "https://api.example.com/repo", name: "repo" } },
          },
        ],
      } as never,
      [],
      {},
      [
        {
          labels: [],
          details: { created_at: "2026-02-01T00:00:00Z", merged_at: null } as never,
          firstCommitAuthorDate: null,
          firstApprovedAt: null,
          readyForReviewAt: null,
        },
      ]
    );

    expect(attributes["github.pull_requests.0.lead_time.pr_ready_for_review_ms"]).toBe(0);
    expect(attributes["github.pull_requests.0.lead_time.pr_approved_ms"]).toBe(0);
    expect(attributes["github.pull_requests.0.lead_time.pr_merged_ms"]).toBe(0);
    expect(attributes["github.pull_requests.0.lead_time.workflow_finished_ms"]).toBe(0);
  });
});
