import { jest } from "@jest/globals";

const createGauge = jest.fn(() => ({}));

jest.unstable_mockModule("../meter", () => ({
  getMeter: () => ({
    createGauge,
  }),
}));

const { getLeadTimeGauge, getLeadTimePhaseGauge } = await import("./meters");

describe("getLeadTimeGauge", () => {
  it("creates each gauge once", () => {
    getLeadTimeGauge();
    getLeadTimeGauge();
    getLeadTimePhaseGauge();
    getLeadTimePhaseGauge();

    expect(createGauge).toHaveBeenCalledTimes(2);
    expect(createGauge).toHaveBeenCalledWith(
      "github.pull_request.lead_time",
      expect.objectContaining({
        unit: "ms",
        description: "Lead time from first commit to workflow completion",
      })
    );
    expect(createGauge).toHaveBeenCalledWith(
      "github.pull_request.lead_time.phase_duration",
      expect.objectContaining({
        unit: "ms",
        description: "Lead time phase duration for pull requests",
      })
    );
  });
});
