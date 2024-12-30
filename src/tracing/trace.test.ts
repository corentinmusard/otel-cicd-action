import type { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";
import { type Attributes, createTracerProvider, stringToHeaders } from "./trace";

describe("createTracerProvider", () => {
  let provider: BasicTracerProvider;
  const attributes: Attributes = {
    serviceName: "workflow-name",
    serviceVersion: "head-sha",
    serviceInstanceId: "test/repo/1/1/1",
    serviceNamespace: "test/repo",
  };

  afterEach(() => {
    return provider.shutdown();
  });

  it("has resource attributes", () => {
    provider = createTracerProvider("localhost", "test=foo", attributes);
    expect(provider.resource.attributes[ATTR_SERVICE_NAME]).toEqual(attributes.serviceName);
    expect(provider.resource.attributes[ATTR_SERVICE_VERSION]).toEqual(attributes.serviceVersion);
    expect(provider.resource.attributes[ATTR_SERVICE_INSTANCE_ID]).toEqual(attributes.serviceInstanceId);
    expect(provider.resource.attributes[ATTR_SERVICE_NAMESPACE]).toEqual(attributes.serviceNamespace);
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

describe("stringToHeaders", () => {
  it("should parse no header", () => {
    const headers = stringToHeaders("");
    expect(headers).toEqual({});
  });

  it("should parse one header", () => {
    const headers = stringToHeaders("aaa=bbb");
    expect(headers).toEqual({ aaa: "bbb" });
  });

  it("should parse multiple headers", () => {
    const headers = stringToHeaders("aaa=bbb,ccc=ddd");
    expect(headers).toEqual({ aaa: "bbb", ccc: "ddd" });
  });

  it("should parse base64 encoded header with =", () => {
    const headers = stringToHeaders("aaa=bnVsbA==");
    expect(headers).toEqual({ aaa: "bnVsbA==" });
  });
});
