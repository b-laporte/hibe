import typescript from 'rollup-plugin-typescript2';
import gzip from "rollup-plugin-gzip";
import minify from 'rollup-plugin-minify-es';

export default {
  input: "src/test/main.spec.ts",
  output: {
    file: "dist/test.js",
    sourcemap: true,
    format: "cjs"
  },
  plugins: [ typescript()], // , minify() , gzip()
  external: ['mocha', 'typescript', 'assert']
};
