import * as grpc from "@grpc/grpc-js";
import { context } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPTraceExporter as ProtoOTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type IdGenerator,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions/incubating";

const OTEL_CONSOLE_ONLY = process.env["OTEL_CONSOLE_ONLY"] === "true";
const OTEL_ID_SEED = Number.parseInt(process.env["OTEL_ID_SEED"] ?? "0");

function stringToHeaders(s: string) {
  const headers: Record<string, string> = {};

  for (const pair of s.split(",")) {
    const [key, value] = pair.split(/=(.*)/s);
    if (key && value) {
      headers[key.trim()] = value.trim();
    }
  }
  return headers;
}

function isHttpEndpoint(endpoint: string) {
  return endpoint.startsWith("https://") || endpoint.startsWith("http://");
}

interface Attributes {
  serviceName: string;
  serviceInstanceId: string;
  serviceNamespace: string;
  serviceVersion: string;
}

function createTracerProvider(endpoint: string, headers: string, attributes: Attributes) {
  // Register the context manager to enable context propagation
  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  let exporter: SpanExporter = new ConsoleSpanExporter();

  if (!OTEL_CONSOLE_ONLY) {
    if (isHttpEndpoint(endpoint)) {
      exporter = new ProtoOTLPTraceExporter({
        url: endpoint,
        headers: stringToHeaders(headers),
      });
    } else {
      exporter = new OTLPTraceExporter({
        url: endpoint,
        credentials: grpc.credentials.createSsl(),
        metadata: grpc.Metadata.fromHttp2Headers(stringToHeaders(headers)),
      });
    }
  }

  const provider = new BasicTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: attributes.serviceName,
      [ATTR_SERVICE_INSTANCE_ID]: attributes.serviceInstanceId,
      [ATTR_SERVICE_NAMESPACE]: attributes.serviceNamespace,
      [ATTR_SERVICE_VERSION]: attributes.serviceVersion,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
    ...(OTEL_ID_SEED && { idGenerator: new DeterministicIdGenerator(OTEL_ID_SEED) }),
  });

  provider.register();
  return provider;
}

// Copied from xorshift32amx here: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#xorshift
function createRandomWithSeed(seed: number) {
  let a = seed;
  return function getRandomInt(max: number) {
    let t = Math.imul(a, 1597334677);
    t = (t >>> 24) | ((t >>> 8) & 65280) | ((t << 8) & 16711680) | (t << 24); // reverse byte order
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    const res = ((a + t) >>> 0) / 4294967296;

    return Math.floor(res * max);
  };
}

/**
 * A deterministic id generator for testing purposes.
 */
class DeterministicIdGenerator implements IdGenerator {
  readonly characters = "0123456789abcdef";
  getRandomInt: (max: number) => number;

  constructor(seed: number) {
    this.getRandomInt = createRandomWithSeed(seed);
  }

  generateTraceId() {
    return this.generateId(32);
  }

  generateSpanId() {
    return this.generateId(16);
  }

  private generateId(length: number) {
    let id = "";

    for (let i = 0; i < length; i++) {
      id += this.characters[this.getRandomInt(this.characters.length)];
    }
    return id;
  }
}

export { type Attributes, stringToHeaders, createTracerProvider };
