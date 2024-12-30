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

interface Attributes {
  serviceName: string;
  serviceInstanceId: string;
  serviceNamespace: string;
  serviceVersion: string;
}

function createTracerProvider(endpoint: string, headers: string, attributes: Attributes) {
  let exporter: SpanExporter = new ConsoleSpanExporter();

  if (!OTEL_CONSOLE_ONLY) {
    if (isHttpEndpoint(endpoint)) {
      exporter = new ProtoOTLPTraceExporter({
        url: endpoint,
        headers: stringToHeaders(headers),
      });
    } else {
      exporter = new OTLPTraceExporter({
        url: endpoint,
        credentials: grpc.credentials.createSsl(),
        metadata: grpc.Metadata.fromHttp2Headers(stringToHeaders(headers)),
      });
    }
  }

  const provider = new BasicTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: attributes.serviceName,
      [ATTR_SERVICE_INSTANCE_ID]: attributes.serviceInstanceId,
      [ATTR_SERVICE_NAMESPACE]: attributes.serviceNamespace,
      [ATTR_SERVICE_VERSION]: attributes.serviceVersion,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register();
  return provider;
}

export { type Attributes, stringToHeaders, createTracerProvider };
