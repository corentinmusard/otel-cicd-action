import type { Gauge } from "@opentelemetry/api";
import { getMeter } from "../meter";

let leadTimeGauge: Gauge | undefined;
let leadTimePhaseGauge: Gauge | undefined;

function getLeadTimeGauge(): Gauge {
  if (!leadTimeGauge) {
    const meter = getMeter();
    leadTimeGauge = meter.createGauge("github.pull_request.lead_time", {
      unit: "ms",
      description: "Lead time from first commit to workflow completion",
    });
  }
  return leadTimeGauge;
}

function getLeadTimePhaseGauge(): Gauge {
  if (!leadTimePhaseGauge) {
    const meter = getMeter();
    leadTimePhaseGauge = meter.createGauge("github.pull_request.lead_time.phase_duration", {
      unit: "ms",
      description: "Lead time phase duration for pull requests",
    });
  }
  return leadTimePhaseGauge;
}

export { getLeadTimeGauge, getLeadTimePhaseGauge };
