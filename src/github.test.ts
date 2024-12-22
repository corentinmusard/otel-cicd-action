import * as fs from "node:fs";
import * as path from "node:path";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import fetchMock from "jest-fetch-mock";
import { mock, mockDeep } from "jest-mock-extended";
import { type WorkflowArtifact, type WorkflowArtifactDownload, listWorkflowRunArtifacts } from "./github";
import { GetPRLabels } from "./github";

jest.mock("@actions/github");
jest.mock("@actions/core");

type ListWorkflowRunArtifactsResponse = RestEndpointMethodTypes["actions"]["listWorkflowRunArtifacts"]["response"];
type DownloadArtifactResponse = RestEndpointMethodTypes["actions"]["downloadArtifact"]["response"];

describe("listWorkflowRunArtifacts", () => {
  let mockContext: Context;
  let mockOctokit: InstanceType<typeof GitHub> = mockDeep<InstanceType<typeof GitHub>>() as InstanceType<typeof GitHub>;
  let subject: WorkflowArtifactDownload;

  beforeAll(async () => {
    mockContext = mockDeep<Context>();
    mockOctokit = mockDeep<InstanceType<typeof GitHub>>();
    const mockListWorkflowRunArtifacts = mockOctokit.rest.actions.listWorkflowRunArtifacts as jest.MockedFunction<
      typeof mockOctokit.rest.actions.listWorkflowRunArtifacts
    >;
    const mockDownloadArtifact = mockOctokit.rest.actions.downloadArtifact as jest.MockedFunction<
      typeof mockOctokit.rest.actions.downloadArtifact
    >;

    mockListWorkflowRunArtifacts.mockResolvedValue(
      mock<ListWorkflowRunArtifactsResponse>({
        data: {
          total_count: 1,
          artifacts: [
            mock<WorkflowArtifact>({
              id: 1,
              name: "{lint-and-test}{run tests}",
            }),
          ],
        },
      }),
    );
    mockDownloadArtifact.mockResolvedValue(mock<DownloadArtifactResponse>({ url: "localhost" }));
    const filePath = path.join(__dirname, "__assets__", "{lint-and-test}{run tests}.zip");
    const zipFile = fs.readFileSync(filePath);
    fetchMock.enableMocks();
    fetchMock.mockResponseOnce(() => Promise.resolve({ body: zipFile as unknown as string }));

    const lookup = await listWorkflowRunArtifacts(mockContext, mockOctokit, 1);
    const response = lookup("lint-and-test", "run tests");
    if (!response) {
      fail("Lookup Failed: Did not parse zip file correctly");
    }
    subject = response;
  });

  afterAll(() => {
    if (subject?.path) {
      fs.unlinkSync(subject.path);
    }
  });

  it("test WorkflowArtifactDownload return to be defined", () => {
    expect(subject).toBeDefined();
  });

  it("test WorkflowArtifactDownload path exists", () => {
    expect(subject.path).toEqual("{lint-and-test}{run tests}.log");
    expect(fs.existsSync(subject.path)).toBeTruthy();
  });
  it("test WorkflowArtifactDownload has data", () => {
    const data = fs.readFileSync(subject.path, { encoding: "utf8", flag: "r" });
    // expect(data.length).toBeGreaterThan(0);
    const lines = data.split("\n");
    expect(lines.length).toBeGreaterThan(1);
  });
});

import * as core from "@actions/core";

jest.mock("@actions/core");
jest.mock("@actions/github/lib/utils");

describe("GetPRLabels", () => {
  let mockOctokit: InstanceType<typeof GitHub>;
  let mockGetInput: jest.SpyInstance;

  beforeAll(() => {
    mockOctokit = mockDeep<InstanceType<typeof GitHub>>();
    mockGetInput = jest.spyOn(core, "getInput");
    mockGetInput.mockReturnValue("fake-token");

    mockOctokit.rest.issues.listLabelsOnIssue = jest.fn().mockResolvedValue({
      data: [{ name: "bug" }, { name: "enhancement" }],
    }) as unknown as jest.MockedFunction<typeof mockOctokit.rest.issues.listLabelsOnIssue>;
  });

  it("should return a string array of label names", async () => {
    const labels = await GetPRLabels(mockOctokit, "owner", "repo", 1);
    expect(labels).toEqual(["bug", "enhancement"]);
  });

  afterAll(() => {
    jest.resetAllMocks();
  });
});
