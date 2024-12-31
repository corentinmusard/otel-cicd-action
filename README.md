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

Look at [Sample OpenTelemetry Output](./src/__assets__/output.txt) for the list of attributes and their values.

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

[ci-img]: https://github.com/corentinmusard/otel-cicd-action/actions/workflows/build.yml/badge.svg?branch=main
[ci]: https://github.com/corentinmusard/otel-cicd-action/actions/workflows/build.yml?query=branch%3Amain
[license-img]: https://img.shields.io/github/license/corentinmusard/otel-cicd-action
