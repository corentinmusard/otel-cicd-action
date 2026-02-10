import type { Gauge } from "@opentelemetry/api";
import { getMeter } from "../meter";

let leadTimeGauge: Gauge | undefined;

function getLeadTimeGauge(): Gauge {
  if (!leadTimeGauge) {
    const meter = getMeter();
    leadTimeGauge = meter.createGauge("github.pull_request.lead_time", {
      unit: "ms",
      description: "PR lead time from creation to workflow completion",
    });
  }
  return leadTimeGauge;
}

export { getLeadTimeGauge };
