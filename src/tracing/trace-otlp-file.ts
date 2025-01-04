import * as fs from "node:fs";
import * as readline from "node:readline";
import {
  type AttributeValue,
  type Attributes,
  type Link,
  SpanKind,
  type SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { ESpanKind, type IAnyValue, type IKeyValue, type ILink, type ISpan } from "@opentelemetry/otlp-transformer";

const tracer = trace.getTracer("otel-cicd-action");

function toSpanKind(spanKind: ESpanKind | undefined) {
  switch (spanKind) {
    case ESpanKind.SPAN_KIND_CLIENT:
      return SpanKind.CLIENT;
    case ESpanKind.SPAN_KIND_CONSUMER:
      return SpanKind.CONSUMER;
    case ESpanKind.SPAN_KIND_INTERNAL:
      return SpanKind.INTERNAL;
    case ESpanKind.SPAN_KIND_PRODUCER:
      return SpanKind.PRODUCER;
    case ESpanKind.SPAN_KIND_SERVER:
      return SpanKind.SERVER;
    default:
      return SpanKind.INTERNAL;
  }
}

function toLinks(links: ILink[] | undefined): Link[] {
  if (links === undefined) {
    return [];
  }
  return [];
}

function toAttributeValue(value: IAnyValue): AttributeValue | undefined {
  if ("stringValue" in value) {
    return value.stringValue ?? undefined;
  }
  if ("arrayValue" in value) {
    return JSON.stringify(value.arrayValue?.values);
  }
  if ("boolValue" in value) {
    return value.boolValue ?? undefined;
  }
  if ("doubleValue" in value) {
    return value.doubleValue ?? undefined;
  }
  if ("intValue" in value) {
    return value.intValue ?? undefined;
  }
  if ("kvlistValue" in value) {
    return JSON.stringify(
      value.kvlistValue?.values.reduce((result, { key, value }) => {
        return { ...result, [key]: toAttributeValue(value) };
      }, {}),
    );
  }
  return undefined;
}

function toAttributes(attributes: IKeyValue[] | undefined): Attributes {
  if (!attributes) {
    return {};
  }

  const rv: Attributes = attributes.reduce((result, { key, value }) => {
    return { ...result, [key]: toAttributeValue(value) };
  }, {} as Attributes);

  return rv;
}

function addSpan(otlpSpan: ISpan) {
  tracer.startActiveSpan(
    otlpSpan.name,
    {
      kind: toSpanKind(otlpSpan.kind),
      attributes: toAttributes(otlpSpan.attributes),
      links: toLinks(otlpSpan.links),
      startTime: new Date((otlpSpan.startTimeUnixNano as number) / 1000000),
    },
    (span) => {
      if (otlpSpan.status) {
        span.setStatus({
          code: otlpSpan.status.code as unknown as SpanStatusCode,
          message: otlpSpan.status.message ?? "",
        });
      }
      span.end(new Date((otlpSpan.endTimeUnixNano as number) / 1000000));
    },
  );
}

async function traceOTLPFile(path: string) {
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of rl) {
    if (!line) {
      continue;
    }
    const serviceRequest = JSON.parse(line);

    for (const resourceSpans of serviceRequest.resourceSpans ?? []) {
      for (const scopeSpans of resourceSpans.scopeSpans ?? resourceSpans.instrumentationLibrarySpans ?? []) {
        for (const otlpSpan of scopeSpans.spans ?? []) {
          addSpan(otlpSpan);
        }
      }
    }
  }
}

export { traceOTLPFile };
