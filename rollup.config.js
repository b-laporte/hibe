import typescript from 'rollup-plugin-typescript2';
import gzip from "rollup-plugin-gzip";
import minify from 'rollup-plugin-minify-es';

export default {
    treeshake: false,
    input: "src/hibe.ts",
    output: {
        file: "dist/hibe.js",
        sourcemap: true,
        format: "es"
    },
    plugins: [typescript(), minify()], // , minify() , gzip()
    external: ['typescript']
};

