import { credentials, Metadata } from "@grpc/grpc-js";
import { type Attributes, type Meter, metrics } from "@opentelemetry/api";
import { OTLPMetricExporter as GrpcOTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPMetricExporter as ProtoOTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import {
  ConsoleMetricExporter,
  MeterProvider,
  type MetricReader,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { isHttpEndpoint, stringToRecord } from "./tracer";

const OTEL_CONSOLE_ONLY = process.env["OTEL_CONSOLE_ONLY"] === "true";

function createMeterProvider(endpoint: string, headers: string, attributes: Attributes) {
  let reader: MetricReader;

  if (OTEL_CONSOLE_ONLY) {
    reader = new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
      exportIntervalMillis: 60_000,
    });
  } else {
    const exporter = isHttpEndpoint(endpoint)
      ? new ProtoOTLPMetricExporter({
          url: endpoint,
          headers: stringToRecord(headers),
        })
      : new GrpcOTLPMetricExporter({
          url: endpoint,
          credentials: credentials.createSsl(),
          metadata: Metadata.fromHttp2Headers(stringToRecord(headers)),
        });

    reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
    });
  }

  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      ...defaultResource().attributes,
      ...attributes,
    }),
    readers: [reader],
  });

  metrics.setGlobalMeterProvider(provider);
  return provider;
}

function getMeter(): Meter {
  return metrics.getMeter("otel-cicd-action");
}

export { createMeterProvider, getMeter };
