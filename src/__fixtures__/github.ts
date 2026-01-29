import * as github from "@actions/github";
import { jest } from "@jest/globals";

export const context = jest.mocked(github.context);
export const getOctokit = jest.fn<typeof github.getOctokit>();
