import typescript from 'rollup-plugin-typescript2';

const pkg = require('./package.json');

export default {
  input: "src/rollup-plugin-hibe.ts",
  output: {
    file: pkg['rollup-plugin-main'],
    sourcemap: true,
    format: "es"
  },
  plugins: [ typescript()], 
  external: ['typescript']
};
