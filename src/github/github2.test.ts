import { Context } from "@actions/github/lib/context";
import { replayOctokit } from "../replay";
import { type Octokit, getPRLabels, getPRsLabels } from "./github";

const token = process.env["GH_TOKEN"] ?? "";
const owner = "corentinmusard";
const repo = "otel-cicd-action";

describe("getPRLabels", () => {
  let octokit: Octokit;

  beforeAll(async () => {
    process.env["GITHUB_REPOSITORY"] = `${owner}/${repo}`;
    octokit = await replayOctokit("getPRLabels", token);
  });

  it("should return the labels for PR 18", async () => {
    const labels = await getPRLabels(new Context(), octokit, 18);
    expect(labels).toEqual(["enhancement", "test"]);
  });

  it("should return the labels for PR 19", async () => {
    const labels = await getPRLabels(new Context(), octokit, 19);
    expect(labels).toEqual([]);
  });
});

describe("getPRsLabels", () => {
  let octokit: Octokit;

  beforeAll(async () => {
    process.env["GITHUB_REPOSITORY"] = `${owner}/${repo}`;
    octokit = await replayOctokit("getPRsLabels", token);
  });

  it("should return the labels for PRs 18 and 19", async () => {
    const labels = await getPRsLabels(new Context(), octokit, [18, 19]);
    expect(labels).toEqual({
      18: ["enhancement", "test"],
      19: [],
    });
  });
});
