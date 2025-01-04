import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        useESM: true,
      },
    ],
  },
  setupFiles: ["dotenv/config"],
  reporters: ["default"],
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["ts", "js"],
  resolver: "ts-jest-resolver",
  coverageReporters: ["lcov", "html", "text"],
  collectCoverageFrom: ["src/**/*.ts", "!src/config.ts", "!src/index.ts", "!src/replay.ts", "!src/__fixtures__/**"],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 50,
      functions: 100,
      lines: 90,
    },
  },
};

export default config;
