import { AngularPlugin } from "treaty-utilities/angular";
import { AngularRoutesBuild } from "treaty-utilities/routes";
import { BuildPlugin } from "treaty-utilities/angular-ivy";

async function build () {
    const file = Bun.file("./src/index.html");
    const plugins = await BuildPlugin()
    await Bun.build({
        entrypoints: ['./src/main.ts'],
        outdir: './dist/treaty/browser',
        define: {
            ngDevMode: 'false',
            ngJitMode: 'false',
            ngI18nClosureMode: 'false',
        },
        format: 'esm',
        splitting: false,
        sourcemap: 'none',
        minify: false,
        target: "browser",
        plugins: [
            AngularRoutesBuild(),
            // AngularPlugin
            //plugins[1],
        ]
      });
      await Bun.write("./dist/treaty/browser/index.html", file);

}

build()