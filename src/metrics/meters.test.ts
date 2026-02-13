import { jest } from "@jest/globals";

const createGauge = jest.fn(() => ({}));

jest.unstable_mockModule("../meter", () => ({
  getMeter: () => ({
    createGauge,
  }),
}));

const { getLeadTimeGauge } = await import("./meters");

describe("getLeadTimeGauge", () => {
  it("creates the gauge once", () => {
    getLeadTimeGauge();
    getLeadTimeGauge();

    expect(createGauge).toHaveBeenCalledTimes(1);
    expect(createGauge).toHaveBeenCalledWith(
      "github.pull_request.lead_time",
      expect.objectContaining({
        unit: "ms",
        description: "Lead time from first commit to workflow completion",
      })
    );
  });
});
