import { jest } from "@jest/globals";
import type { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import { mock } from "jest-mock-extended";
import type { WorkflowRunJobs } from "../github/github";
import { createTracerProvider, stringToHeaders } from "./trace";

describe("createTracerProvider", () => {
  let subject: BasicTracerProvider;
  let mockWorkflowRunJobs: WorkflowRunJobs;

  beforeEach(() => {
    jest.useFakeTimers();
    mockWorkflowRunJobs = mock<WorkflowRunJobs>({
      workflowRun: {
        name: "workflow-name",
        workflow_id: 1,
        id: 1,
        repository: {
          full_name: "test/repo",
        },
        head_sha: "head-sha",
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    return subject.shutdown();
  });
  describe("resource attributes", () => {
    it("has service.name resource as workflow name", () => {
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs);
      expect(subject.resource.attributes[ATTR_SERVICE_NAME]).toEqual(mockWorkflowRunJobs.workflowRun.name);
    });

    it("has service.name resource as workflow id", () => {
      mockWorkflowRunJobs.workflowRun.name = null;
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs);
      expect(subject.resource.attributes[ATTR_SERVICE_NAME]).toEqual(`${mockWorkflowRunJobs.workflowRun.id}`);
    });

    it("has service.name resource as a custom parameter", () => {
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs, "custom-service-name");
      expect(subject.resource.attributes[ATTR_SERVICE_NAME]).toEqual("custom-service-name");
    });

    it("has service.instance.id resource", () => {
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs);
      expect(subject.resource.attributes[ATTR_SERVICE_INSTANCE_ID]).toEqual(
        [
          mockWorkflowRunJobs.workflowRun.repository.full_name,
          mockWorkflowRunJobs.workflowRun.workflow_id,
          mockWorkflowRunJobs.workflowRun.id,
          mockWorkflowRunJobs.workflowRun.run_attempt,
        ].join("/"),
      );
    });

    it("has service.namespace resource", () => {
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs);
      expect(subject.resource.attributes[ATTR_SERVICE_NAMESPACE]).toEqual(
        mockWorkflowRunJobs.workflowRun.repository.full_name,
      );
    });
  });

  it("has active span processor", () => {
    subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs);
    const spanProcessor = subject.getActiveSpanProcessor();
    expect(spanProcessor).toBeDefined();
  });

  it("supports https", () => {
    subject = createTracerProvider("https://localhost", "test=foo", mockWorkflowRunJobs);
    const spanProcessor = subject.getActiveSpanProcessor();
    expect(spanProcessor).toBeDefined();
  });

  it("supports http", () => {
    subject = createTracerProvider("http://localhost", "test=foo", mockWorkflowRunJobs);
    const spanProcessor = subject.getActiveSpanProcessor();
    expect(spanProcessor).toBeDefined();
  });
});

describe("stringToHeaders", () => {
  it("should parse no header", () => {
    const headers = stringToHeaders("");
    expect(headers).toEqual({});
  });

  it("should parse one header", () => {
    const headers = stringToHeaders("aaa=bbb");
    expect(headers).toEqual({ aaa: "bbb" });
  });

  it("should parse multiple headers", () => {
    const headers = stringToHeaders("aaa=bbb,ccc=ddd");
    expect(headers).toEqual({ aaa: "bbb", ccc: "ddd" });
  });

  it("should parse base64 encoded header with =", () => {
    const headers = stringToHeaders("aaa=bnVsbA==");
    expect(headers).toEqual({ aaa: "bnVsbA==" });
  });
});
