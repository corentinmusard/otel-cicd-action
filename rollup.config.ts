// See: https://rollupjs.org/introduction/

import * as path from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import type { RollupOptions } from "rollup";
import license from "rollup-plugin-license";

const config: RollupOptions = {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    sourcemap: true,
  },
  plugins: [
    typescript(),
    nodeResolve(),
    commonjs(),
    json(),
    license({
      thirdParty: {
        output: path.join("dist", "licenses.txt"),
      },
    }),
  ],
};

export default config;
