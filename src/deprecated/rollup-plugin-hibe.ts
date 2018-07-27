import { isHibeFile, compile } from './compiler';

interface TransformCtxt {
    warn: (msg: string) => void;
    error: (msg: string) => void;
}

const RX_TS_FILE = /\.ts$/i;

export default function (pluginOptions?: { sourceMap: boolean, traceFile?: string, runtime?: string }) {
    let traceFile = "", sourceMap = false;

    if (pluginOptions) {
        traceFile = pluginOptions.traceFile || ""; // e.g. "testnode.ts"
        sourceMap = pluginOptions.sourceMap !== false;
    }

    let processor = {
        options: function (rollupCfg) {
            // retrieve config if need be
        },

        transform: function (this: TransformCtxt, source, filePath: string) {
            // id corresponds to the file path
            // e.g "/Users/blaporte/Dev/hibe/src/test/main.ts" on MacOS
            // note: the options() method will always be called before transform()
            let newSource = source;

            if (filePath.match(RX_TS_FILE) && isHibeFile(source)) {
                let output = compile(source, filePath, this);

                // todo manage errors
                if (traceFile && (filePath.substr(-traceFile.length) === traceFile)) {
                    console.log("")
                    console.log("############################################################################");
                    console.log("file: " + filePath);
                    console.log("############################################################################");
                    console.log(output);
                }

                newSource = output;
            }

            if (sourceMap) {
                // TODO use magic-string to generate source maps
                if (newSource !== source) {
                    console.log("[Hibe] Source Maps are not supported - yet");
                }
                return { code: newSource, map: { version: 3, file: '', sources: [], sourcesContent: [], names: [], mappings: '' } };
            }

            return newSource;

        }
    };
    return processor;
}
