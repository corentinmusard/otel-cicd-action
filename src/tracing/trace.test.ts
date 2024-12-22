import type { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import {
  SEMRESATTRS_SERVICE_INSTANCE_ID,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from "@opentelemetry/semantic-conventions";
import { mock } from "jest-mock-extended";
import type { WorkflowRunJobs } from "../github";
import { createTracerProvider, stringToHeader } from "./trace";

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
      expect(subject.resource.attributes[SEMRESATTRS_SERVICE_NAME]).toEqual(mockWorkflowRunJobs.workflowRun.name);
    });

    it("has service.name resource as workflow id", () => {
      mockWorkflowRunJobs.workflowRun.name = null;
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs);
      expect(subject.resource.attributes[SEMRESATTRS_SERVICE_NAME]).toEqual(`${mockWorkflowRunJobs.workflowRun.id}`);
    });

    it("has service.name resource as a custom parameter", () => {
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs, "custom-service-name");
      expect(subject.resource.attributes[SEMRESATTRS_SERVICE_NAME]).toEqual("custom-service-name");
    });

    it("has service.instance.id resource", () => {
      subject = createTracerProvider("localhost", "test=foo", mockWorkflowRunJobs);
      expect(subject.resource.attributes[SEMRESATTRS_SERVICE_INSTANCE_ID]).toEqual(
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
      expect(subject.resource.attributes[SEMRESATTRS_SERVICE_NAMESPACE]).toEqual(
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
});

describe("stringToHeader", () => {
  it("should parse one header", () => {
    const headers = stringToHeader("aaa=bbb");
    expect(headers).toEqual({ aaa: "bbb" });
  });

  it("should parse multiple headers", () => {
    const headers = stringToHeader("aaa=bbb,ccc=ddd");
    expect(headers).toEqual({ aaa: "bbb", ccc: "ddd" });
  });

  it("should parse base64 encoded header with =", () => {
    const headers = stringToHeader("aaa=bnVsbA==");
    expect(headers).toEqual({ aaa: "bnVsbA==" });
  });
});
