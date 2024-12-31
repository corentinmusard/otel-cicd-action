# Open Telemetry CI/CD Action

[![Unit Tests][ci-img]][ci]
![GitHub License][license-img]

This action exports Github CI/CD workflows to any endpoint compatible with OpenTelemetry.

This is a fork of [otel-export-trace-action](https://github.com/inception-health/otel-export-trace-action) with more features and better support.

![Example](./docs/honeycomb-example.png)

## Usage

We provide sample code for popular platforms. If you feel one is missing, please open an issue.

| Code Sample                 | File                                             |
| --------------------------- | ------------------------------------------------ |
| Inside an existing workflow | [build.yml](.github/workflows/build.yml)         |
| From a private repository   | [private.yml](.github/workflows/private.yml)     |
| Axiom                       | [axiom.yml](.github/workflows/axiom.yml)         |
| New Relic                   | [newrelic.yml](.github/workflows/newrelic.yml)   |
| Honeycomb                   | [honeycomb.yml](.github/workflows/honeycomb.yml) |
| Dash0                       | [dash0.yml](.github/workflows/dash0.yml)         |
| Jaeger                      | WIP                                              |
| Grafana                     | WIP                                              |

### On workflow_run event

```yaml
on:
  workflow_run:
    workflows:
      # The name of the workflow(s) that triggers the export
      - "Build"
    types: [completed]

jobs:
  otel-cicd-actions:
    runs-on: ubuntu-latest
    steps:
      - uses: corentinmusard/otel-cicd-action@v1
        with:
          otlpEndpoint: grpc://api.honeycomb.io:443/
          otlpHeaders: ${{ secrets.OTLP_HEADERS }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          runId: ${{ github.event.workflow_run.id }}
```

### Inside an existing workflow

```yaml
jobs:
  build:
    # ... existing code
  otel-cicd-action:
    if: always()
    name: OpenTelemetry Export Trace
    runs-on: ubuntu-latest
    needs: [build] # must run when all jobs are completed
    steps:
      - name: Export workflow
        uses: corentinmusard/otel-cicd-action@v1
        with:
          otlpEndpoint: grpc://api.honeycomb.io:443/
          otlpHeaders: ${{ secrets.OTLP_HEADERS }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
```

### Private Repository

If you are using a private repository, you need to set the following permissions in your workflow file.
It can be done at the global level or at the job level.

```yaml
permissions:
  contents: read # To access the private repository
  actions: read # To read workflow runs
  pull-requests: read # To read PR labels
```

### Action Inputs

| name            | description                                                                                                 | required | default                               | example                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- | ---------------------------------------------------------------- |
| otlpEndpoint    | The destination endpoint to export OpenTelemetry traces to. It supports `https://`, `http://` and `grpc://` endpoints. | true     |                                       | `https://api.axiom.co/v1/traces`                                 |
| otlpHeaders     | Headers to add to the OpenTelemetry exporter .                                                              | true     |                                       | `x-honeycomb-team=YOUR_API_KEY,x-honeycomb-dataset=YOUR_DATASET` |
| otelServiceName | OpenTelemetry service name                                                                                  | false    | `<The name of the exported workflow>` | `Build CI`                                                       |
| githubToken     | The repository token with Workflow permissions. Required for private repos                                  | false    |                                       | `${{ secrets.GITHUB_TOKEN }}`                                    |
| runId           | Workflow Run ID to Export                                                                                   | false    | env.GITHUB_RUN_ID                     | `${{ github.event.workflow_run.id }}`                            |

### Action Outputs

| name    | description                                 |
| ------- | ------------------------------------------- |
| traceId | The OpenTelemetry Trace ID of the root span |

[Sample OpenTelemetry Output](./src/__assets__/output.txt).

#### Honeycomb Example Trace

![HoneyComb Example](./docs/honeycomb-example.png)

_with JUnit traces_
![HoneyComb Junit Example](./docs/honeycomb-junit-example.png)

## With Junit Tracing

Combined with [OpenTelemetry Upload Trace Artifact](https://github.com/marketplace/actions/opentelemetry-upload-trace-artifact) this action will Download the OTLP Trace Log Artifact uploaded from the Workflow Run and export it.

**pr-workflow.yml**

```yaml
name: "PR check"

on:
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - name: Install Dependencies
        run: npm ci --ignore-scripts
      - name: run tests
        run: npm run test:ci
      - uses: inception-health/otel-upload-test-artifact-action@v1
        if: always()
        with:
          jobName: "build-and-test"
          stepName: "run tests"
          path: "junit.xml"
          type: "junit"
          githubToken: ${{ secrets.GITHUB_TOKEN }}
```

**otel-cicd.yml**

```yaml
name: OpenTelemetry Export Traces

on:
  workflow_run:
    workflows: ["PR check"]
    types: [completed]

jobs:
  otel-cicd-action:
    runs-on: ubuntu-latest
    steps:
      - name: Export Workflow Traces
        uses: corentinmusard/otel-cicd-action@v1
        with:
          otlpEndpoint: grpc://api.honeycomb.io:443/
          otlpHeaders: ${{ secrets.OTLP_HEADERS }}
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          runId: ${{ github.event.workflow_run.id }}
```

## Trace Unique Fields

| name                                    | type     | description                                           |
| --------------------------------------- | -------- | ----------------------------------------------------- |
| name                                    | string   | Workflow/Job/Step name                                |
| service.instance.id                     | string   | {repo_full_name}/{workflow_id}/{run_id}/{run_num}     |
| service.name                            | string   | Github Workflow Name                                  |
| service.namespace                       | string   | Github Repo Full Name                                 |
| service.version                         | string   | Github Workflow Run HEAD SHA                          |
| github.workflow_id                      | integer  | Github Workflow ID                                    |
| github.workflow                         | string   | Github Workflow Name                                  |
| github.workflow_url                     | string   | Github Workflow URL                                   |
| github.run_attempt                      | integer  | Github Workflow Run Attempt                           |
| github.run_id                           | integer  | Github Workflow Run ID                                |
| github.run_number                       | integer  | Github Workflow Run Number                            |
| github.created_at                       | integer  | Github Workflow Run Created Timestamp                 |
| github.updated_at                       | integer  | Github Workflow Run Updated Timestamp                 |
| github.run_started_at                   | integer  | Github Workflow Run Started Timestamp                 |
| github.html_url                         | string   | Github Workflow Run HTML URL                          |
| github.author_email                     | string   | **_DEPRECATED_**: use github.head_commit.author.email |
| github.author_name                      | string   | **_DEPRECATED_**: use github.head_commit.author.name  |
| github.conclusion                       | string   | Github Workflow Run Conclusion                        |
| github.event                            | string   | Github Workflow Run Event Name                        |
| github.git_refs_url                     | string   | Github Workflow Run refs url                          |
| github.head_commit.id                   | string   | Github Workflow Run HEAD commit id                    |
| github.head_commit.tree_id              | string   | Github Workflow Run HEAD commit tree id               |
| github.head_commit.author.name          | string   | Github Workflow Run HEAD author name                  |
| github.head_commit.author.email         | string   | Github Workflow Run HEAD author name                  |
| github.head_commit.committer.name       | string   | Github Workflow Run HEAD committer name               |
| github.head_commit.committer.email      | string   | Github Workflow Run HEAD committer name               |
| github.head_commit.message              | string   | Github Workflow Run HEAD commit message               |
| github.head_commit.timestamp            | string   | Github Workflow Run HEAD commit timestamp             |
| github.head_sha                         | string   | Github Workflow Run HEAD SHA                          |
| github.head_ref                         | string   | Github Workflow Run HEAD REF                          |
| github.base_sha                         | string   | Github Workflow Run Base SHA                          |
| github.base_ref                         | string   | Github Workflow Run Base REF                          |
| github.pull_requests.{X}.id             | string   | Github Pull Request ID                                |
| github.pull_requests.{X}.number         | integer  | Github Pull Request number                            |
| github.pull_requests.{X}.url            | string   | Github Pull Request url                               |
| github.pull_requests.{X}.labels         | string[] | Github Pull Request labels                            |
| github.pull_requests.{X}.head.sha       | string   | Github Pull Request HEAD sha                          |
| github.pull_requests.{X}.head.ref       | string   | Github Pull Request HEAD ref                          |
| github.pull_requests.{X}.head.repo.id   | string   | Github Pull Request HEAD Repository id                |
| github.pull_requests.{X}.head.repo.url  | string   | Github Pull Request HEAD Repository url               |
| github.pull_requests.{X}.head.repo.name | string   | Github Pull Request HEAD Repository name              |
| github.pull_requests.{X}.base.sha       | string   | Github Pull Request base sha                          |
| github.pull_requests.{X}.base.ref       | string   | Github Pull Request base ref                          |
| github.pull_requests.{X}.base.repo.id   | string   | Github Pull Request base Repository id                |
| github.pull_requests.{X}.base.repo.url  | string   | Github Pull Request base Repository url               |
| github.pull_requests.{X}.base.repo.name | string   | Github Pull Request base Repository name              |
| github.job.id                           | float    | Github Job Run ID                                     |
| github.job.name                         | string   | Github Job Run Name                                   |
| github.job.started_at                   | string   | Github Job Run started_at                             |
| github.job.completed_at                 | string   | Github Job Run completed_at                           |
| github.job.conclusion                   | string   | Github Job Run Conclusion                             |
| github.job.labels                       | string   | Github Job Run Labels. Comma separated values         |
| github.job.run_attempt                  | integer  | Github Job Run Run Attempt                            |
| github.job.run_id                       | integer  | Github Job Run Run ID                                 |
| github.job.runner_group_id              | integer  | Github Job Runner Group ID                            |
| github.job.runner_group_name            | string   | Github Job Runner Group Name                          |
| github.job.runner_name                  | string   | Github Job Runner Name                                |
| github.job.step.status                  | string   | GitHub Step Run Status                                |
| github.job.step.conclusion              | string   | Github Step Run Conclusion                            |
| github.job.step.name                    | string   | Github Step Run Name                                  |
| github.job.step.number                  | integer  | Github Step Run Number                                |
| github.job.step.started_at              | string   | Github Step Run started_at                            |
| github.job.step.completed_at            | string   | Github Step Run completed_at                          |

[ci-img]: https://github.com/corentinmusard/otel-cicd-action/actions/workflows/build.yml/badge.svg?branch=main
[ci]: https://github.com/corentinmusard/otel-cicd-action/actions/workflows/build.yml?query=branch%3Amain
[license-img]: https://img.shields.io/github/license/corentinmusard/otel-cicd-action
