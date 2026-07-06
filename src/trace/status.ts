import { type Span, SpanStatusCode } from "@opentelemetry/api";
import { ATTR_ERROR_TYPE } from "@opentelemetry/semantic-conventions";

const errorConclusions = new Set(["failure", "timed_out", "startup_failure"]);

/**
 * Record the span status according to the OpenTelemetry recording-errors conventions:
 * status is set to Error (with error.type) when the run failed, and left unset otherwise.
 * https://opentelemetry.io/docs/specs/semconv/general/recording-errors/
 */
function recordConclusion(span: Span, conclusion: string | null | undefined) {
  if (conclusion && errorConclusions.has(conclusion)) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.setAttribute(ATTR_ERROR_TYPE, conclusion);
  }
}

export { recordConclusion };
