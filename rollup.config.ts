// See: https://rollupjs.org/introduction/

import * as fs from "node:fs";
import * as path from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import type { Plugin, RollupOptions } from "rollup";
import license from "rollup-plugin-license";

// Bundled dependencies (and their license files) may ship with CRLF line
// endings, which would make the committed dist/ differ from a fresh build
// under the LF-only .gitattributes policy.
function normalizeEol(): Plugin {
  return {
    name: "normalize-eol",
    writeBundle() {
      for (const file of [path.join("dist", "index.js"), path.join("dist", "licenses.txt")]) {
        const content = fs.readFileSync(file, "utf8");
        fs.writeFileSync(file, content.replaceAll("\r\n", "\n"));
      }
    },
  };
}

const config: RollupOptions = {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    sourcemap: true,
  },
  plugins: [
    typescript(),
    nodeResolve(),
    commonjs({
      transformMixedEsModules: true,
    }),
    json(),
    license({
      thirdParty: {
        output: path.join("dist", "licenses.txt"),
      },
    }),
    normalizeEol(),
  ],
};

export default config;
