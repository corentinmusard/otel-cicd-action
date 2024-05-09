import { Tracer } from "@opentelemetry/sdk-trace-base";
import * as core from "@actions/core";
import * as fs from "fs";
import * as readline from "readline";
import {
  Attributes,
  AttributeValue,
  context,
  Link,
  Span,
  SpanKind,
  SpanStatusCode,
} from "@opentelemetry/api";
import {
  IKeyValue,
  ESpanKind,
  IAnyValue,
  ISpan,
  ILink,
  IExportTraceServiceRequest,
} from "@opentelemetry/otlp-transformer";

/* istanbul ignore next */
function toSpanKind(spanKind: ESpanKind | undefined): SpanKind {
  switch (spanKind) {
    /* istanbul ignore next */
    case ESpanKind.SPAN_KIND_CLIENT:
      return SpanKind.CLIENT;
    /* istanbul ignore next */
    case ESpanKind.SPAN_KIND_CONSUMER:
      return SpanKind.CONSUMER;
    case ESpanKind.SPAN_KIND_INTERNAL:
      return SpanKind.INTERNAL;
    /* istanbul ignore next */
    case ESpanKind.SPAN_KIND_PRODUCER:
      return SpanKind.PRODUCER;
    /* istanbul ignore next */
    case ESpanKind.SPAN_KIND_SERVER:
      return SpanKind.SERVER;
    /* istanbul ignore next */
    default:
      return SpanKind.INTERNAL;
  }
}

function toLinks(links: ILink[] | undefined): Link[] {
  /* istanbul ignore if */
  if (links === undefined) {
    return [];
  }
  // TODO implement Links
  return [];
}

function toAttributeValue(value: IAnyValue): AttributeValue | undefined {
  /* istanbul ignore else */
  if ("stringValue" in value) {
    /* istanbul ignore next */
    return value.stringValue ?? undefined;
  } else if ("arrayValue" in value) {
    return JSON.stringify(value.arrayValue?.values);
  } else if ("boolValue" in value) {
    return value.boolValue ?? undefined;
  } else if ("doubleValue" in value) {
    return value.doubleValue ?? undefined;
  } else if ("intValue" in value) {
    return value.intValue ?? undefined;
  } else if ("kvlistValue" in value) {
    return JSON.stringify(
      value.kvlistValue?.values.reduce((result, { key, value }) => {
        return { ...result, [key]: toAttributeValue(value) };
      }, {}),
    );
  }
  /* istanbul ignore next */
  return undefined;
}

function toAttributes(attributes: IKeyValue[] | undefined): Attributes {
  /* istanbul ignore if */
  if (!attributes) {
    return {};
  }

  const rv: Attributes = attributes.reduce((result, { key, value }) => {
    return { ...result, [key]: toAttributeValue(value) };
  }, {} as Attributes);

  return rv;
}

function addSpanToTracer(otlpSpan: ISpan, tracer: Tracer) {
  const span = tracer.startSpan(
    otlpSpan.name,
    {
      kind: toSpanKind(otlpSpan.kind),
      attributes: toAttributes(otlpSpan.attributes),
      links: toLinks(otlpSpan.links),
      startTime: new Date((otlpSpan.startTimeUnixNano as number) / 1000000),
    },
    context.active(),
  );

  if (otlpSpan.status) {
    span.setStatus({
      code: otlpSpan.status.code as unknown as SpanStatusCode,
      message: otlpSpan.status.message ?? "",
    });
  }
  span.end(new Date((otlpSpan.endTimeUnixNano as number) / 1000000));
}

export type TraceOTLPFileParams = {
  tracer: Tracer;
  parentSpan: Span;
  path: string;
  startTime: Date;
};
export async function traceOTLPFile({
  tracer,
  parentSpan,
  path,
}: TraceOTLPFileParams): Promise<void> {
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line) {
      const serviceRequest = JSON.parse(line) as IExportTraceServiceRequest;
      /* istanbul ignore next */
      for (const resourceSpans of serviceRequest.resourceSpans ?? []) {
        /* istanbul ignore next */
        for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
          if (scopeSpans.scope) {
            /* istanbul ignore next */
            for (const otlpSpan of scopeSpans.spans ?? []) {
              core.debug(
                `Trace Test ParentSpan<${
                  otlpSpan.parentSpanId?.toString() ||
                  parentSpan.spanContext().spanId
                }> -> Span<${otlpSpan.spanId.toString()}> `,
              );
              addSpanToTracer(otlpSpan, tracer);
            }
          }
        }
      }
    }
  }
}
