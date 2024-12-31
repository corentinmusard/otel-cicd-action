# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.13.0] - 2024-12-31

### Added

- Add attributes on the workflow span:
  - `github.referenced_workflows`
  - `github.url`
  - `github.status`
  - `github.node_id`
  - `github.check_suite_id`
  - `github.check_suite_node_id`
  - `github.jobs_url`
  - `github.logs_url`
  - `github.check_suite_url`
  - `github.artifacts_url`
  - `github.cancel_url`
  - `github.rerun_url`
  - `github.head_branch`
  - `github.path`
  - `github.display_title`
- Add attributes on the job spans:
  - `github.job.run_url`
  - `github.job.node_id`
  - `github.job.head_sha`
  - `github.job.url`
  - `github.job.html_url`
  - `github.job.status`
  - `github.job.runner_id`
  - `github.job.created_at`
  - `github.job.check_run_url`
  - `github.job.workflow_name`
  - `github.job.head_branch`

### Fixed

- Return the correct value for `github.head_commit.author.name` and `github.head_commit.committer.name`

## [1.12.1] - 2024-12-31

### Fixed

- Fix rollup build by setting transformMixedEsModules to true

### Changed

- Use global context propagation instead of passing it around

## [1.12.0] - 2024-12-30

### Added

- Add step.status field

### Changed

- Remove trace.ts dependency on github.ts
- Simplify paginated octokit queries
- Use global tracer instead of passing it around
- tests: Add a replay client
- Migrate to ESM
- Migrate from ncc to rollup
- Migrate from eslint/prettier to biome

## [1.11.0] - 2024-12-19

### Added

- Add support for `http` endpoints

### Changed

- Update dependencies

## [1.10.0] - 2024-11-08

### Added

- Update otel dependencies to latest
- Add example for configuration with Dash0
- Add OpenTelemetry CICD Pipeline Attributes
- Add labels from a PR to the trace span

## [1.9.1] - 2024-05-09

### Fixed

- Split headers only on the first `=` character

### Changed

- Update dependencies
- Update dev dependencies

## [1.9.0] - 2024-05-04

### Added

- Support for `https` endpoints (proto over http).
- Update to node 20.x

[unreleased]: https://github.com/corentinmusard/otel-cicd-action/compare/v1.13.0...HEAD
[1.13.0]: https://github.com/corentinmusard/otel-cicd-action/compare/v1.12.1...v1.13.0
[1.12.1]: https://github.com/corentinmusard/otel-cicd-action/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/corentinmusard/otel-cicd-action/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/corentinmusard/otel-cicd-action/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/corentinmusard/otel-cicd-action/compare/v1.9.1...v1.10.0
[1.9.1]: https://github.com/corentinmusard/otel-cicd-action/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/corentinmusard/otel-cicd-action/releases/tag/v1.9.0

Versions previous to 1.9.0 were developed in another repository. To see previous changelog entries see the [CHANGELOG.md](https://github.com/inception-health/otel-export-trace-action/blob/v1.8.0/CHANGELOG.md).
