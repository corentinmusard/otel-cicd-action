# CLAUDE.md — Documentation sync to dash0.com/docs

This directory holds the implementation behind the GitHub Actions workflow
`.github/workflows/sync-docs-to-website.yaml`. Together they copy the CI/CD Action's documentation
(README.md) into the documentation that powers https://www.dash0.com/docs, applying a declared set of
modifications and opening a pull request against the documentation repository.

## What the workflow does

`.github/workflows/sync-docs-to-website.yaml` defines a single job, `sync-docs`, that runs the following steps:

1. **Checks out** this repository (`otel-cicd-action`) and sets up Python 3.x.
2. **Installs dependencies** from `requirements.txt` (just PyYAML).
3. **Applies the doc transformations** by running `apply-transformations.py` with three arguments:
   - source root: repository root (contains README.md)
   - transformation declarations: `transformations.yaml`
   - output directory: `${RUNNER_TEMP}/transformed-docs`
4. **Checks out the target repository** (the docs repo) using a fine-grained PAT.
5. **Copies** the transformed file (`dash0/miscellaneous/manage-as-code/manage-cicd-observability-as-code.md`) into the configured target directory.
6. **Creates or updates a pull request** in the target repository: it stages the target directory, and if there
   is a meaningful diff, commits to the branch `sync-otel-cicd-action-docs`, force-pushes it, and opens
   a PR against `main` (or relies on the force-push to update an already-open PR).

### Configuration (repository secrets)

- `DASH0_DOCS_REPO_GITHUB_PAT` — fine-grained PAT scoped to the target repo with **Contents: Read and write**
  (to push the branch) and **Pull requests: Read and write** (to open the PR).
- `SYNC_DOCUMENTATION_TARGET_REPOSITORY` — `owner/name` of the documentation repository.
- `SYNC_DOCUMENTATION_TARGET_DIRECTORY` — path of the directory within that repo holding the documentation pages.

## How it is implemented in this directory

| File                       | Role                                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transformations.yaml`     | **Source of truth.** Declares the common and per-file transformations, the source→target file mapping, and the frontmatter `title`/`description` for each page.                                                      |
| `apply-transformations.py` | The engine. Reads `transformations.yaml`, applies the transformations to each source file, and writes the results to the output directory. Knows _how_ to apply transformations; it does not hard-code _which_ ones. |
| `requirements.txt`         | Python dependencies (PyYAML).                                                                                                                                                                                        |
| `test-locally.sh`          | Runs the transformation step locally in a throwaway venv, writing output to `.transformed-docs` for inspection — mirrors the workflow without touching the docs repo.                                                |

### `transformations.yaml` structure

- **`common`** — a list of transformations applied to every synced file, in order, before the file-specific ones.
  Currently it strips the leading top-level heading (the generated frontmatter `title` replaces it).
- **`files`** — one entry per page. Each entry has:
  - `source` — path relative to the repository root (README.md).
  - `target` — path relative to the target directory in the docs repo.
  - `title` / `description` — rendered into the generated frontmatter.
  - `transformations` — optional list of transformations applied to this file only, after the common ones.

The documentation is kept as a single file:

- **manage-cicd-observability-as-code.md** — Complete README content with transformations applied

This keeps the entire GitHub Action documentation together in one page within the "Manage as Code" section.

### Supported transformation types

- `prepend` — insert `content` at the very beginning of the document.
- `replace-regex` — replace matches of the Python regex `find` with `replace`. Optional `flags`: `multiline`,
  `dotall`, `ignorecase`.
- `remove-line` — remove the whole line containing the literal `line` marker; collapses any resulting run of
  blank lines to a single blank line.

By default every `replace-regex` / `remove-line` must match at least once, otherwise the workflow **fails** —
this guards against the docs drifting away from `transformations.yaml` so a modification silently becomes a
no-op. Set `required: false` on an individual transformation to allow zero matches.

### Per-file processing pipeline (`apply-transformations.py`)

For each `files` entry the script:

1. Applies the `common` transformations, then the file-specific `transformations`.
2. Prepends a generated frontmatter block (`title`, `description`, `lastUpdated`).
3. Writes the result to `target` inside the output directory.

### Placeholders

Inserted/replacement text (the `content` of `prepend` and the `replace` of `replace-regex`) may use placeholders,
expanded when applied (not in `find` patterns). The only one currently supported is `$timestamp` — the current
UTC date/time, computed once per run so all occurrences render identically.

## When editing

- **Changing README.md structure**: Update `transformations.yaml` if link patterns or content structure changes significantly.
- **Adding new transformations**: Add entries in `transformations.yaml`, not the Python script.
- **Verify locally** with `./test-locally.sh` and inspect the output under `.transformed-docs`.

## Testing locally

Run `./test-locally.sh` from this directory. It creates a temporary Python virtual environment, installs
dependencies, runs the transformations, and writes the output to `.transformed-docs` in the repository root.

Review the generated file to ensure transformations are working correctly before pushing changes.

## Workflow triggers

The workflow runs:

1. **Manually** via workflow_dispatch in GitHub Actions UI
2. **Automatically** when README.md changes on main branch
3. **Automatically** when action.yml changes (may affect input documentation)
4. **Automatically** when sync infrastructure changes (transformations.yaml, scripts, workflow file)
5. **On release** (via workflow_call) — can be invoked from release workflows

## Troubleshooting

### Transformation doesn't match

If a transformation fails with "matched nothing", the source content has likely changed:

1. Run `./test-locally.sh` to see the exact error
2. Update the regex pattern or set `required: false` if the transformation is optional
3. Check that content structure still matches expectations

### Links are broken

Check the link rewriting transformations:

- Relative links should be rewritten to absolute GitHub URLs
- Links must use extensionless paths (no .md suffix) in the website
- Verify target pages exist in the documentation navigation

### Generated docs look wrong

1. Verify the transformations in transformations.yaml match current README.md structure
2. Run locally to see intermediate transformation steps
3. Check that frontmatter is correctly generated

## Maintenance

- **Monitor workflow runs**: Check GitHub Actions for failures
- **Update transformations**: When README.md structure changes significantly
- **Review sync PRs**: Ensure generated content meets quality standards
- **Keep in sync with other repos**: If Web SDK or Operator sync infrastructure improves, consider backporting changes

## Relationship to other "Manage as Code" pages

This page joins other "Manage X as Code" pages in the documentation:

- Manage Check Rules as Code
- Manage Dashboards as Code
- Manage Notification Channels as Code
- Manage Spam Filters as Code
- Manage Synthetic Checks as Code
- Manage Views as Code
- **Manage CI/CD Observability as Code** (this page)

All are listed in the "Infrastructure as Code" section of `dash0/miscellaneous/manage-as-code/nav.json`.
