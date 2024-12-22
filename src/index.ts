import * as core from "@actions/core";
import { run } from "./runner";

run().catch((error: Error) => {
  core.setFailed(error.message);
});
