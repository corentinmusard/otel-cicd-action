import * as grpc from "@grpc/grpc-js";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPTraceExporter as ProtoOTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import type { WorkflowRunJobs } from "../github/github";

const OTEL_CONSOLE_ONLY = process.env["OTEL_CONSOLE_ONLY"] === "true";

function stringToHeaders(s: string) {
  const headers: Record<string, string> = {};

  for (const pair of s.split(",")) {
    const [key, value] = pair.split(/=(.*)/s);
    if (key && value) {
      headers[key.trim()] = value.trim();
    }
  }
  return headers;
}

function isHttpEndpoint(endpoint: string) {
  return endpoint.startsWith("https://") || endpoint.startsWith("http://");
}

function createTracerProvider(
  otlpEndpoint: string,
  otlpHeaders: string,
  workflowRunJobs: WorkflowRunJobs,
  otelServiceName?: string | null | undefined,
) {
  const serviceName =
    otelServiceName || workflowRunJobs.workflowRun.name || `${workflowRunJobs.workflowRun.workflow_id}`;
  const serviceInstanceId = [
    workflowRunJobs.workflowRun.repository.full_name,
    workflowRunJobs.workflowRun.workflow_id,
    workflowRunJobs.workflowRun.id,
    workflowRunJobs.workflowRun.run_attempt,
  ].join("/");
  const serviceNamespace = workflowRunJobs.workflowRun.repository.full_name;
  const serviceVersion = workflowRunJobs.workflowRun.head_sha;

  let exporter: SpanExporter = new ConsoleSpanExporter();

  if (!OTEL_CONSOLE_ONLY) {
    if (isHttpEndpoint(otlpEndpoint)) {
      exporter = new ProtoOTLPTraceExporter({
        url: otlpEndpoint,
        headers: stringToHeaders(otlpHeaders),
      });
    } else {
      exporter = new OTLPTraceExporter({
        url: otlpEndpoint,
        credentials: grpc.credentials.createSsl(),
        metadata: grpc.Metadata.fromHttp2Headers(stringToHeaders(otlpHeaders)),
      });
    }
  }

  const provider = new BasicTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_INSTANCE_ID]: serviceInstanceId,
      [ATTR_SERVICE_NAMESPACE]: serviceNamespace,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register();
  return provider;
}

export { stringToHeaders, createTracerProvider };
