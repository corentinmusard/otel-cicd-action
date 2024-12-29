import * as path from "node:path";
import { jest } from "@jest/globals";
import * as api from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
  type Tracer,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { traceOTLPFile } from "./trace-otlp-file";

describe("traceOTLPFile", () => {
  let memoryExporter: InMemorySpanExporter;
  let tracerProvider: BasicTracerProvider;
  let tracer: Tracer;

  beforeAll(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new BasicTracerProvider({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: "traceTestReportArtifact",
      }),
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });
    tracerProvider.register();
    tracer = tracerProvider.getTracer("default");
  });

  beforeEach(() => {
    memoryExporter.reset();
  });

  afterEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    return tracerProvider.shutdown();
  });

  it("testsuites otlp trace", async () => {
    const filePath = path.join("src", "tracing", "__assets__", "testsuites-trace.otlp");
    const startTime = new Date("2022-01-22T04:45:30");

    const parentSpan = tracer.startSpan(
      "traceTestReportArtifact",
      { startTime, root: true, attributes: { root: true } },
      api.ROOT_CONTEXT,
    );
    await traceOTLPFile(tracer, filePath);
    parentSpan.end(new Date("2022-01-22T04:45:34"));

    const spans = memoryExporter.getFinishedSpans();
    expect(spans.length).toEqual(9);

    // don't test the parentSpan
    for (const span of spans.slice(0, -1)) {
      expectSpan(span);
    }
  });

  it("testsuite otlp trace", async () => {
    const filePath = path.join("src", "tracing", "__assets__", "testsuite-trace.otlp");
    const startTime = new Date("2022-01-22T04:45:30");

    const parentSpan = tracer.startSpan(
      "traceTestReportArtifact",
      { startTime, root: true, attributes: { root: true } },
      api.ROOT_CONTEXT,
    );
    await traceOTLPFile(tracer, filePath);
    parentSpan.end(new Date("2022-01-22T04:45:34"));

    const spans = memoryExporter.getFinishedSpans();
    expect(spans.length).toEqual(7);

    // don't test the parentSpan
    for (const span of spans.slice(0, -1)) {
      expectSpan(span);
    }
  });

  it("test failed otlp trace", async () => {
    const filePath = path.join("src", "tracing", "__assets__", "fail-test-trace.otlp");
    const startTime = new Date("2022-02-01T18:37:11");

    const parentSpan = tracer.startSpan(
      "traceTestReportArtifact",
      { startTime, root: true, attributes: { root: true } },
      api.ROOT_CONTEXT,
    );
    await traceOTLPFile(tracer, filePath);
    parentSpan.end(new Date("2022-02-01T18:37:14"));

    const spans = memoryExporter.getFinishedSpans();
    expect(spans.length).toEqual(14);

    // don't test the parentSpan
    for (const span of spans.slice(0, -1)) {
      expectSpan(span);
    }
  });
});

function expectSpan(s: ReadableSpan) {
  expect(Object.keys(s.attributes).length).toBeGreaterThan(0);
  expect(s.endTime[0]).toBeGreaterThanOrEqual(s.startTime[0]);
  expect(s.endTime[1]).toBeGreaterThanOrEqual(s.startTime[1]);
  expect(s.status.message).toBe("");
  expect(s.status.code).toBeGreaterThan(0);
  if (s.status.code === api.SpanStatusCode.ERROR) {
    expect(s.attributes["error"]).toBeTruthy();
  } else {
    expect(s.attributes["error"]).toBeFalsy();
  }
}
