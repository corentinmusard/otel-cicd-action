import type * as github from "@actions/github";
import { Context } from "@actions/github/lib/context";
import { jest } from "@jest/globals";

export const context = new Context();
export const getOctokit = jest.fn<typeof github.getOctokit>();
