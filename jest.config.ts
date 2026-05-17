import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Playwright specs live under e2e/ and are run by `playwright test`,
  // not Jest. Keep Jest from picking them up.
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
};

export default createJestConfig(config);
