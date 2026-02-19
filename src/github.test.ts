import { extractPRNumberFromCommitMessage } from "./github";

describe("extractPRNumberFromCommitMessage", () => {
  describe("squash merge format", () => {
    it("extracts PR number from squash merge commit", () => {
      const message = "Upgrade action to use node24 (#63)";
      expect(extractPRNumberFromCommitMessage(message)).toBe(63);
    });

    it("extracts PR number from multi-line squash merge commit", () => {
      const message = "Add missing semconv attributes (#62)\n\nCloses #60";
      expect(extractPRNumberFromCommitMessage(message)).toBe(62);
    });

    it("extracts PR number with description", () => {
      const message = "feat: Add arbitrary resource attributes (#41)";
      expect(extractPRNumberFromCommitMessage(message)).toBe(41);
    });

    it("does not extract PR number from middle of message", () => {
      const message = "Fix issue (#123) and update docs";
      expect(extractPRNumberFromCommitMessage(message)).toBeNull();
    });
  });

  describe("merge commit format", () => {
    it("extracts PR number from merge commit", () => {
      const message = "Merge pull request #123 from user/feature-branch";
      expect(extractPRNumberFromCommitMessage(message)).toBe(123);
    });

    it("extracts PR number from merge commit with newlines", () => {
      const message = "Merge pull request #456 from user/feature\n\nAdd new feature";
      expect(extractPRNumberFromCommitMessage(message)).toBe(456);
    });
  });

  describe("edge cases", () => {
    it("returns null for null message", () => {
      expect(extractPRNumberFromCommitMessage(null)).toBeNull();
    });

    it("returns null for undefined message", () => {
      expect(extractPRNumberFromCommitMessage(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(extractPRNumberFromCommitMessage("")).toBeNull();
    });

    it("returns null for regular commit message without PR reference", () => {
      const message = "Add feature without PR reference";
      expect(extractPRNumberFromCommitMessage(message)).toBeNull();
    });

    it("returns null for rebase merge (no PR reference)", () => {
      const message = "Feature commit\n\nImplemented new functionality";
      expect(extractPRNumberFromCommitMessage(message)).toBeNull();
    });

    it("extracts first match when squash pattern appears", () => {
      // Squash pattern at end takes precedence
      const message = "Fix multiple issues (#100)";
      expect(extractPRNumberFromCommitMessage(message)).toBe(100);
    });

    it("handles issue references in body but not title", () => {
      const message = "Fix linting issues (#789)\n\nfixes #123, closes #456";
      expect(extractPRNumberFromCommitMessage(message)).toBe(789);
    });
  });
});
