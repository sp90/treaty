
import angularApplicationPreset from '@angular-devkit/build-angular/src/tools/babel/presets/application';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer';
import {
    type CompilerHost,
    type NgtscProgram,
} from '@angular/compiler-cli';
import { transformAsync } from '@babel/core';
import {
    mergeTransformers,
    replaceBootstrap,
} from '@ngtools/webpack/src/ivy/transformation';
import ts from 'typescript';

import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { BunPlugin, Transpiler, plugin } from 'bun';
import { normalize } from 'path'

interface EmitFileResult {
    code: string;
    map?: string;
    dependencies: readonly string[];
    hash?: Uint8Array;
}
type FileEmitter = (file: string) => Promise<EmitFileResult | undefined>;

export const BuildPlugin = async (): Promise<BunPlugin[]> => {
    let tsconfigPath = '';
    let rootNames: string[] = [];
    let compilerOptions: any = {};
    let host: ts.CompilerHost;
    let fileEmitter: FileEmitter | undefined;
    let cssPlugin: Plugin | undefined;
    let complierCli = await loadEsmModule<
        typeof import('@angular/compiler-cli')
    >('@angular/compiler-cli');


    async function buildAndAnalyze() {
        const angularProgram: NgtscProgram = new complierCli.NgtscProgram(
            rootNames,
            compilerOptions,
            host as CompilerHost,
        );

        const angularCompiler = angularProgram.compiler;
        const typeScriptProgram = angularProgram.getTsProgram();
        const builder = ts.createAbstractBuilder(typeScriptProgram, host);
        await angularCompiler.analyzeAsync();
        const diagnostics = angularCompiler.getDiagnostics();

        const msg = ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
        if (msg) {
            return msg;
        }

        fileEmitter = createFileEmitter(
            builder,
            mergeTransformers(angularCompiler.prepareEmit().transformers, {
                before: [replaceBootstrap(() => builder.getProgram().getTypeChecker())],
            }),
            () => [],
        );
    }


    const { options: tsCompilerOptions, rootNames: rn } = complierCli.readConfiguration(
        tsconfigPath,
        {
            compilationMode: 'full',
            suppressOutputPathCheck: true,
            outDir: undefined,
            inlineSourceMap: false,
            inlineSources: false,
            declaration: false,
            declarationMap: false,
            allowEmptyCodegenFiles: false,
            annotationsAs: 'decorators',
            enableResourceInlining: false,
            supportTestBed: false,
        },
    );

    rootNames = rn;
    compilerOptions = tsCompilerOptions;
    host = ts.createIncrementalCompilerHost(compilerOptions);



    const msg2 = await buildAndAnalyze();
    if (msg2) {
        console.log(msg2);
        process.exit(1);
    }

    tsconfigPath = complierCli.join(process.cwd(), 'tsconfig.app.json');


    return [
        // createCompilerPlugin({
        //     tsconfig: tsconfigPath,
        //     sourcemap: false,
        //     advancedOptimizations: true,
        //     incremental: true,
        // }),
        {
            name: 'bun-plugin-angular-prod',
            setup(build) {
                augmentHostWithResources(
                    host,
                    (code, id) => { },
                    {
                        inlineStylesExtension: 'css',
                    },
                );

                build.onLoad({ filter: /\.[cm]?ts?$/ }, async ({ path }) => {
                    if (path.includes('node_modules')) {
                        return {
                            contents: await Bun.file(path).text(),
                            loader: 'ts'
                        }
                    }


                    const result = await fileEmitter!(path);
                    const data = result?.code ?? '';
                    const forceAsyncTransformation =
                        /for\s+await\s*\(|async\s+function\s*\*/.test(data);
                    const babelResult = await transformAsync(data, {
                        filename: path,
                        inputSourceMap: false,
                        sourceMaps: false,
                        compact: false,
                        configFile: false,
                        babelrc: false,
                        browserslistConfigFile: false,
                        plugins: [],
                        presets: [
                            [
                                angularApplicationPreset,
                                {
                                    forceAsyncTransformation,
                                    optimize: {},
                                },
                            ],
                        ],
                    });
                    return {
                        contents: babelResult?.code ?? '',
                        loader: 'ts'
                    }

                })
            }
        },
    ];
};

function createFileEmitter(
    program: ts.BuilderProgram,
    transformers: ts.CustomTransformers = {},
    onAfterEmit?: (sourceFile: ts.SourceFile) => void,
): FileEmitter {
    return async (file: string) => {
        const sourceFile = program.getSourceFile(file);
        if (!sourceFile) {
            return undefined;
        }

        let code: string = '';
        program.emit(
            sourceFile,
            (filename, data) => {
                if (/\.[cm]?js$/.test(filename)) {
                    if (data) {
                        code = data;
                    }
                }
            },
            undefined /* cancellationToken */,
            undefined /* emitOnlyDtsFiles */,
            transformers,
        );

        onAfterEmit?.(sourceFile);

        return { code, dependencies: [] };
    };
}

function augmentHostWithResources(
    host: ts.CompilerHost,
    transform: (
        code: string,
        id: string,
        options?: { ssr?: boolean },
    ) => ReturnType<any> | null,
    options: {
        inlineStylesExtension?: string;
    } = {},
) {
    const resourceHost = host as CompilerHost;

    resourceHost.readResource = function (fileName: string) {
        const filePath = normalize(fileName);

        const content = this.readFile(filePath);
        if (content === undefined) {
            throw new Error('Unable to locate component resource: ' + fileName);
        }

        return content;
    };

    resourceHost.transformResource = async function (data, context) {
        // Only style resources are supported currently
        if (context.type !== 'style') {
            return null;
        }

        if (options.inlineStylesExtension) {
            // Resource file only exists for external stylesheets
            const filename =
                context.resourceFile ??
                `${context.containingFile.replace(
                    /\.ts$/,
                    `.${options?.inlineStylesExtension}`,
                )}`;

            let stylesheetResult;

            try {
                stylesheetResult = await transform(data, `${filename}?direct`);
            } catch (e) {
                console.error(`${e}`);
            }

            return { content: stylesheetResult?.code || '' };
        }

        return null;
    };
}

function createCompilerPlugin(
    pluginOptions: CompilerPluginOptions,
): BunPlugin {
    const javascriptTransformer = new JavaScriptTransformer(pluginOptions, 1);

    return {
        name: 'bun-plugin-angular-deps-optimizer',
        async setup(build) {
            build.config = build.config ?? {
                define: {
                    ngDevMode: 'false',
                    ngJitMode: 'false',
                    ngI18nClosureMode: 'false',
                }
            }
            const transpiler = new Transpiler({ loader: "ts", allowBunRuntime: true, });

            build.onLoad({ filter: /\.[cm]?js$/ }, async args => {
                const fileText = await Bun.file(args.path).text()
                // const contents = await javascriptTransformer.transformData(args.path, fileText, true, false);
                const javascript = transpiler.transformSync(fileText);
                // await javascriptTransformer.close()
                return {
                contents: javascript,
                loader: 'js',
                };
            });
        },
    };
}
const plugins = await BuildPlugin()

plugin(plugins[0])