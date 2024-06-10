"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const github_1 = require("./github");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const jest_mock_extended_1 = require("jest-mock-extended");
const jest_fetch_mock_1 = __importDefault(require("jest-fetch-mock"));
const github_2 = require("./github");
jest.mock("@actions/github");
jest.mock("@actions/core");
describe("listWorkflowRunArtifacts", () => {
    let mockContext;
    let mockOctokit = (0, jest_mock_extended_1.mockDeep)();
    let subject;
    beforeAll(async () => {
        mockContext = (0, jest_mock_extended_1.mockDeep)();
        mockOctokit = (0, jest_mock_extended_1.mockDeep)();
        const mockListWorkflowRunArtifacts = mockOctokit.rest.actions
            .listWorkflowRunArtifacts;
        const mockDownloadArtifact = mockOctokit.rest.actions
            .downloadArtifact;
        mockListWorkflowRunArtifacts.mockResolvedValue((0, jest_mock_extended_1.mock)({
            data: {
                total_count: 1,
                artifacts: [
                    (0, jest_mock_extended_1.mock)({
                        id: 1,
                        name: "{lint-and-test}{run tests}",
                    }),
                ],
            },
        }));
        mockDownloadArtifact.mockResolvedValue((0, jest_mock_extended_1.mock)({ url: "localhost" }));
        const filePath = path.join(__dirname, "__assets__", "{lint-and-test}{run tests}.zip");
        const zipFile = fs.readFileSync(filePath);
        jest_fetch_mock_1.default.enableMocks();
        jest_fetch_mock_1.default.mockResponseOnce(() => Promise.resolve({ body: zipFile }));
        const lookup = await (0, github_1.listWorkflowRunArtifacts)(mockContext, mockOctokit, 1);
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
const core = __importStar(require("@actions/core"));
jest.mock("@actions/core");
jest.mock("@actions/github/lib/utils");
describe("GetPRLabels", () => {
    let mockOctokit;
    let mockGetInput;
    beforeAll(() => {
        mockOctokit = (0, jest_mock_extended_1.mockDeep)();
        mockGetInput = jest.spyOn(core, "getInput");
        mockGetInput.mockReturnValue("fake-token");
        mockOctokit.rest.issues.listLabelsOnIssue = jest.fn().mockResolvedValue({
            data: [{ name: "bug" }, { name: "enhancement" }],
        });
    });
    it("should return a comma-separated string of label names", async () => {
        const labels = await (0, github_2.GetPRLabels)(mockOctokit, "owner", "repo", 1);
        expect(labels).toEqual("bug, enhancement");
    });
    afterAll(() => {
        jest.resetAllMocks();
    });
});
//# sourceMappingURL=github.test.js.map