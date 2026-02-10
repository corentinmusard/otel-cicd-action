/** biome-ignore-all lint/suspicious/noBitwiseOperators: needed for the number generator */
import { credentials, Metadata } from "@grpc/grpc-js";
import { type Attributes, context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter as GrpcOTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPTraceExporter as ProtoOTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type IdGenerator,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";

const OTEL_CONSOLE_ONLY = process.env["OTEL_CONSOLE_ONLY"] === "true";
const OTEL_ID_SEED = Number.parseInt(process.env["OTEL_ID_SEED"] ?? "0", 10);

const assignmentRegex = /=(.*)/s;

function stringToRecord(s: string) {
  const record: Record<string, string> = {};

  for (const pair of s.split(",")) {
    const [key, value] = pair.split(assignmentRegex);
    if (key && value) {
      record[key.trim()] = value.trim();
    }
  }
  return record;
}

function isHttpEndpoint(endpoint: string) {
  return endpoint.startsWith("https://") || endpoint.startsWith("http://");
}

function createTracerProvider(endpoint: string, headers: string, attributes: Attributes) {
  // Register the context manager to enable context propagation
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  let exporter: SpanExporter = new ConsoleSpanExporter();

  if (!OTEL_CONSOLE_ONLY) {
    if (isHttpEndpoint(endpoint)) {
      exporter = new ProtoOTLPTraceExporter({
        url: endpoint,
        headers: stringToRecord(headers),
      });
    } else {
      exporter = new GrpcOTLPTraceExporter({
        url: endpoint,
        credentials: credentials.createSsl(),
        metadata: Metadata.fromHttp2Headers(stringToRecord(headers)),
      });
    }
  }

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      ...defaultResource().attributes,
      ...attributes,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
    ...(OTEL_ID_SEED && { idGenerator: new DeterministicIdGenerator(OTEL_ID_SEED) }),
  });

  trace.setGlobalTracerProvider(provider);
  return provider;
}

// Copied from xorshift32amx here: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#xorshift
function createRandomWithSeed(seed: number) {
  let a = seed;
  return function getRandomInt(max: number) {
    let t = Math.imul(a, 1_597_334_677);
    t = (t >>> 24) | ((t >>> 8) & 65_280) | ((t << 8) & 16_711_680) | (t << 24); // reverse byte order
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    const res = ((a + t) >>> 0) / 4_294_967_296;

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

export { stringToRecord, isHttpEndpoint, createTracerProvider };
