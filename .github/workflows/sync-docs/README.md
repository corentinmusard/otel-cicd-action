# CI/CD Action Documentation Sync

This directory contains the infrastructure for automatically synchronizing CI/CD Action documentation from this repository to the Dash0 website documentation.

## Quick Start

### Test Locally

```bash
cd .github/workflows/sync-docs
./test-locally.sh
```

This will generate transformed documentation in `.transformed-docs/` at the repository root.

### Manual Sync

1. Go to Actions → Synchronize CI/CD Action docs to dash0.com/docs
2. Click "Run workflow"
3. Review the auto-generated PR in the target repository

## Files

- **sync-docs-to-website.yaml** - GitHub Actions workflow (in parent directory)
- **transformations.yaml** - Transformation rules (source of truth)
- **apply-transformations.py** - Transformation engine
- **requirements.txt** - Python dependencies
- **test-locally.sh** - Local testing script
- **CLAUDE.md** - Detailed documentation
- **README.md** - This file

## How It Works

1. README.md is transformed into a single page:
   - `manage-cicd-observability-as-code.md` - Complete action documentation

2. Transformations are applied:
   - Remove top-level heading (replaced by frontmatter)
   - Add auto-generated warning
   - Add introduction with link to Manage as Code overview
   - Rewrite relative GitHub links to absolute URLs
   - Update issue references to include support contact

3. Frontmatter is generated with title, description, and timestamp

4. File is written to target repository at `dash0/miscellaneous/manage-as-code/` and a PR is created

## Repository Secrets

Required secrets (configured in repository settings):

- `DASH0_DOCS_REPO_GITHUB_PAT` - Fine-grained PAT with Contents + PR permissions
- `SYNC_DOCUMENTATION_TARGET_REPOSITORY` - Target repo (e.g., `dash0hq/dash0-website`)
- `SYNC_DOCUMENTATION_TARGET_DIRECTORY` - Target path (e.g., `src/app/(core)/docs/content`)

## Editing

### Changing Content

Edit README.md directly. Changes will sync automatically when pushed to main.

### Changing Transformations

1. Edit `transformations.yaml`
2. Test locally: `./test-locally.sh`
3. Review generated file in `.transformed-docs/`
4. Commit and push

### Changing Target Location

If the README structure changes significantly, update the transformation patterns in `transformations.yaml`.

## Troubleshooting

### "matched nothing" error

The transformation regex didn't find expected content. Check:

1. Content structure in README.md still matches patterns
2. Set `required: false` if transformation is optional

### Links broken in website

Check:

1. Link rewriting transformations in transformations.yaml
2. Target page exists in website navigation
3. Paths use extensionless format (no .md)

### Generated content wrong

1. Run `./test-locally.sh`
2. Check transformation order in transformations.yaml
3. Verify regex patterns match current README.md structure

## See Also

- **CLAUDE.md** - Complete implementation documentation
- **Web SDK sync** - Similar implementation at `dash0-sdk-web/.github/workflows/sync-docs/`
- **Operator sync** - Similar implementation at `dash0-operator/.github/workflows/sync-docs/`
