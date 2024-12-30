import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { Context } from "@actions/github/lib/context";
import { jest } from "@jest/globals";
import type { components } from "@octokit/openapi-types";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import fetchMock from "jest-fetch-mock";
import { mock, mockDeep } from "jest-mock-extended";
import type { Octokit } from "./github";
import { type WorkflowArtifactDownload, listWorkflowRunArtifacts } from "./github";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

jest.mock("@actions/github");
jest.mock("@actions/core");

type Artifacts = components["schemas"]["artifact"][];
type DownloadArtifactResponse = RestEndpointMethodTypes["actions"]["downloadArtifact"]["response"];

describe("listWorkflowRunArtifacts", () => {
  let mockContext: Context;
  let mockOctokit: Octokit = mockDeep<Octokit>();
  let subject: WorkflowArtifactDownload;

  beforeAll(async () => {
    mockContext = mockDeep<Context>();
    mockOctokit = mockDeep<Octokit>();
    const mockPaginate = mockOctokit.paginate as jest.MockedFunction<typeof mockOctokit.paginate>;
    const mockDownloadArtifact = mockOctokit.rest.actions.downloadArtifact as jest.MockedFunction<
      typeof mockOctokit.rest.actions.downloadArtifact
    >;

    mockPaginate.mockResolvedValue(
      mock<Artifacts>([
        {
          id: 1,
          name: "{lint-and-test}{run tests}",
        },
      ]),
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
