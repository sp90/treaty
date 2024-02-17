import { plugin, type BunPlugin, Transpiler } from "bun";
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer'


export const AngularPlugin: BunPlugin = {
  name: "Angular Bun loader",
  setup(build) {

    const javascriptTransformer = new JavaScriptTransformer({
        sourcemap: false,
        advancedOptimizations: false,
        jit: true,
        
    },  1);
    const transpiler = new Transpiler({ loader: "ts" });

    build.onLoad({filter: /\.[cm]?[jt]s?$/ }, (async ({path}) => {
      try {
        const fileText = await Bun.file(path).text()
        const contents = await javascriptTransformer.transformData(path, fileText, true, false);
        const javascript = transpiler.transformSync(contents.toString());
        await javascriptTransformer.close()
        return {
          contents: javascript,
          loader: 'ts',
        };
      } catch (error) {
        console.log('error:' ,error)
      }
    }))
  },
};

plugin(AngularPlugin);