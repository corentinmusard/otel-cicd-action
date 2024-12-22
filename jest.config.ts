import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  setupFiles: ["dotenv/config"],
  reporters: ["default", "jest-junit"],
  collectCoverageFrom: ["src/**/*.ts", "!src/config.ts", "!**/index.ts"],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    /*global: {
      statements: 40,
      branches: 25,
      functions: 53,
      lines: 50,
    },*/
  },
};

export default config;
