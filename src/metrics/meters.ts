import type { Gauge } from "@opentelemetry/api";
import { getMeter } from "../meter";

let leadTimeGauge: Gauge | undefined;

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

export { getLeadTimeGauge };
