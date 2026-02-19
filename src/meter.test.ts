import { jest } from "@jest/globals";
import { metrics } from "@opentelemetry/api";

process.env["OTEL_CONSOLE_ONLY"] = "true";

const getMeterMock = jest.spyOn(metrics, "getMeter").mockReturnValue({} as never);
const setGlobalMeterProviderMock = jest.spyOn(metrics, "setGlobalMeterProvider").mockImplementation(() => true);

const { createMeterProvider, getMeter } = await import("./meter");

describe("getMeter", () => {
  it("uses the otel-cicd-action meter name", () => {
    getMeter();
    expect(getMeterMock).toHaveBeenCalledWith("otel-cicd-action");
  });
});

describe("createMeterProvider", () => {
  it("creates a meter provider", () => {
    const provider = createMeterProvider("", "", {});
    expect(provider).toBeDefined();
    expect(setGlobalMeterProviderMock).toHaveBeenCalled();
  });
});
