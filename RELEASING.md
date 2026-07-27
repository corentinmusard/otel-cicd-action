# Releasing

Releases are automated and require a single manual trigger plus a PR review.
The process is inspired by the one of [open-telemetry/opentelemetry-injector](https://github.com/open-telemetry/opentelemetry-injector).

## How to release

1. Make sure the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md) is up to date. The release fails if it is empty.
2. Trigger the [Prepare release](../../actions/workflows/prepare-release.yml) workflow from the Actions tab.
   Pick the bump type (`patch`, `minor`, or `major`), or provide an explicit version to override it.
   The next version is computed from the latest `vX.Y.Z` tag.
3. The workflow opens a PR titled `chore: prepare release vX.Y.Z` that bumps the version in `package.json`/`package-lock.json` and rolls the `[Unreleased]` changelog section into a dated `vX.Y.Z` section.
4. Review and **squash-merge** the PR, keeping the PR title as the commit title.
   The [Release](../../actions/workflows/release.yml) workflow detects the release commit on `main` and automatically:
   - creates the `vX.Y.Z` tag,
   - moves the floating major tag (e.g. `v4`) to the release commit,
   - publishes a GitHub release whose notes are the changelog section for that
     version.

That's it — nothing else to click.

## Notes

- The release commit is matched by its message (`chore: prepare release vX.Y.Z`), so do not reword the PR title when merging, and do not use a merge commit or rebase merge.
- PRs created with the default `GITHUB_TOKEN` do not trigger CI checks (a GitHub Actions limitation).
  To have the regular checks run on the release PR, configure a `RELEASE_PAT` repository secret containing a fine-grained personal access token with `contents: write` and `pull-requests: write` permissions on this repository.
  Without it, the release PR shows no checks; `main` was already validated by CI on every merged PR, so this is safe but requires an admin merge if branch protection mandates the checks.
- Major version bumps change the floating tag users reference (`dash0hq/otel-cicd-action@v4` → `@v5`): remember to update the references in [README.md](README.md) in the release PR or a follow-up.
