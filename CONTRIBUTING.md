# How to Contribute to otel-cicd-action

## Getting Started

```sh
git clone git@github.com:corentinmusard/otel-cicd-action.git
cd otel-cicd-action
```

Setup precommit hook, install dependencies:

```sh
npm run prepare
npm i
```

Fill `.env.test` based on `.env.test.example`.

`GH_TOKEN` can be found by running `gh auth token`

## Testing

We use a record/replay octokit client to make testing easier.

`npm run test:record` will record all the request made with a real octokit client.

`npm run test` will replay the recorded requests.

## Pushing code

Be sure to run the following command before pushing code.

```sh
npm run all
```
