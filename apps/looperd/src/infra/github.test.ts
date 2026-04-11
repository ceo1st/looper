import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GhCliGitHubGateway } from "./github";

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("GhCliGitHubGateway", () => {
  test("lists, snapshots, and reviews pull requests through gh", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "looper-gh-"));
    cleanupPaths.push(rootDir);

    const logPath = join(rootDir, "gh.log");
    const scriptPath = join(rootDir, "gh");
    await writeFile(
      scriptPath,
      `#!/bin/sh\nprintf '%s\n' "$*" >> "${logPath}"\nif [ "$1" = "pr" ] && [ "$2" = "list" ]; then\n  printf '[{"number":42,"title":"Review me","url":"https://example.test/pr/42","state":"OPEN","isDraft":false,"reviewDecision":"REVIEW_REQUIRED","headRefName":"feature","baseRefName":"main","author":{"login":"octocat"},"reviewRequests":[{"__typename":"User","login":"OctoCat"},{"__typename":"Team","slug":"platform"}]}]'
elif [ "$1" = "pr" ] && [ "$2" = "view" ]; then\n  printf '{"number":42,"title":"Review me","body":"Body","url":"https://example.test/pr/42","state":"OPEN","isDraft":false,"reviewDecision":"CHANGES_REQUESTED","headRefName":"feature","baseRefName":"main","headRefOid":"abc123","baseRefOid":"def456","author":{"login":"octocat"},"reviewRequests":[{"requestedReviewer":{"__typename":"User","login":"reviewer"}},{"requestedReviewer":{"__typename":"Team","slug":"platform"}}],"comments":[{"state":"UNRESOLVED"}],"reviews":[{"state":"COMMENTED"}],"statusCheckRollup":[{"conclusion":"SUCCESS"}]}'
elif [ "$1" = "pr" ] && [ "$2" = "diff" ]; then\n  printf 'diff --git a/a.ts b/a.ts\n'
elif [ "$1" = "api" ] && [ "$2" = "user" ]; then\n  printf 'reviewer\n'
else\n  exit 0\nfi\n`,
    );
    await chmod(scriptPath, 0o755);

    const gateway = new GhCliGitHubGateway({
      ghPath: scriptPath,
      cwd: rootDir,
    });
    const prs = await gateway.listOpenPullRequests({ repo: "acme/looper" });
    const snapshot = await gateway.capturePullRequestSnapshot({
      projectId: "project_1",
      repo: "acme/looper",
      prNumber: 42,
    });
    await gateway.submitReview({
      repo: "acme/looper",
      prNumber: 42,
      event: "COMMENT",
      body: "Looks good",
    });

    expect(prs[0]?.number).toBe(42);
    expect(prs[0]?.reviewRequests).toEqual(["OctoCat"]);
    expect(snapshot.headSha).toBe("abc123");
    expect(snapshot.reviewState).toBe("CHANGES_REQUESTED");
    const detail = await gateway.viewPullRequest({
      repo: "acme/looper",
      prNumber: 42,
    });
    expect(detail.reviewRequests).toEqual(["reviewer"]);
    await expect(gateway.getCurrentUserLogin()).resolves.toBe("reviewer");

    const log = await readFile(logPath, "utf8");
    expect(log).toContain(
      "pr review 42 --repo acme/looper --comment --body Looks good",
    );
  });
});
