import { jest } from "@jest/globals";

const createGauge = jest
  .fn()
  .mockReturnValueOnce({ name: "lead-time-gauge" })
  .mockReturnValueOnce({ name: "phase-gauge" });

jest.unstable_mockModule("../meter", () => ({
  getMeter: () => ({
    createGauge,
  }),
}));

const { getLeadTimeGauge, getLeadTimePhaseGauge } = await import("./meters");

describe("getLeadTimeGauge", () => {
  it("creates and memoizes the lead time gauge", () => {
    const firstGauge = getLeadTimeGauge();
    const secondGauge = getLeadTimeGauge();

    expect(firstGauge).toBe(secondGauge);
    expect(createGauge).toHaveBeenCalledTimes(1);
    expect(createGauge).toHaveBeenNthCalledWith(
      1,
      "github.pull_request.lead_time",
      expect.objectContaining({
        unit: "ms",
        description: "Lead time from first commit to workflow completion",
      })
    );
  });
});

describe("getLeadTimePhaseGauge", () => {
  it("creates and memoizes the lead time phase gauge", () => {
    const firstGauge = getLeadTimePhaseGauge();
    const secondGauge = getLeadTimePhaseGauge();

    expect(firstGauge).toBe(secondGauge);
    expect(createGauge).toHaveBeenCalledTimes(2);
    expect(createGauge).toHaveBeenNthCalledWith(
      2,
      "github.pull_request.lead_time.phase_duration",
      expect.objectContaining({
        unit: "ms",
        description: "Lead time phase duration for pull requests",
      })
    );
  });
});
