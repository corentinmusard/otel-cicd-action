import type { ResourceAttributes } from "@opentelemetry/resources";
import type { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import { createTracerProvider, stringToRecord } from "./tracer";

describe("createTracerProvider", () => {
  let provider: BasicTracerProvider;
  const attributes: ResourceAttributes = {
    [ATTR_SERVICE_NAME]: "workflow-name",
    [ATTR_SERVICE_VERSION]: "head-sha",
    [ATTR_SERVICE_INSTANCE_ID]: "test/repo/1/1/1",
    [ATTR_SERVICE_NAMESPACE]: "test/repo",
    "extra.attribute": "1",
  };

  afterEach(() => {
    return provider.shutdown();
  });

  it("has resource attributes", () => {
    provider = createTracerProvider("localhost", "test=foo", attributes);
    expect(provider.resource.attributes[ATTR_SERVICE_NAME]).toEqual(attributes[ATTR_SERVICE_NAME]);
    expect(provider.resource.attributes[ATTR_SERVICE_VERSION]).toEqual(attributes[ATTR_SERVICE_VERSION]);
    expect(provider.resource.attributes[ATTR_SERVICE_INSTANCE_ID]).toEqual(attributes[ATTR_SERVICE_INSTANCE_ID]);
    expect(provider.resource.attributes[ATTR_SERVICE_NAMESPACE]).toEqual(attributes[ATTR_SERVICE_NAMESPACE]);
    expect(provider.resource.attributes["extra.attribute"]).toEqual(attributes["extra.attribute"]);
  });

  it("has active span processor", () => {
    provider = createTracerProvider("localhost", "test=foo", attributes);
    const spanProcessor = provider.getActiveSpanProcessor();
    expect(spanProcessor).toBeDefined();
  });

  it("supports https", () => {
    provider = createTracerProvider("https://localhost", "test=foo", attributes);
    const spanProcessor = provider.getActiveSpanProcessor();
    expect(spanProcessor).toBeDefined();
  });

  it("supports http", () => {
    provider = createTracerProvider("http://localhost", "test=foo", attributes);
    const spanProcessor = provider.getActiveSpanProcessor();
    expect(spanProcessor).toBeDefined();
  });
});

describe("stringToRecord", () => {
  it("should parse no header", () => {
    const headers = stringToRecord("");
    expect(headers).toEqual({});
  });

  it("should parse one header", () => {
    const headers = stringToRecord("aaa=bbb");
    expect(headers).toEqual({ aaa: "bbb" });
  });

  it("should parse multiple headers", () => {
    const headers = stringToRecord("aaa=bbb,ccc=ddd");
    expect(headers).toEqual({ aaa: "bbb", ccc: "ddd" });
  });

  it("should parse base64 encoded header with =", () => {
    const headers = stringToRecord("aaa=bnVsbA==");
    expect(headers).toEqual({ aaa: "bnVsbA==" });
  });
});
