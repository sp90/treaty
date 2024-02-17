import type { Route } from "@angular/router";
import { plugin, type BunPlugin, Transpiler } from "bun";
import { relative, dirname } from 'path'

export type AngularRouting = {
  redirectTo?: string;
  filePath?: string
  pagesPath?: string;
}
type RoutingMapper = { imports: string[], routes: string[] }
export type RoutingMeta = Omit<Route, 'path' | 'matcher' | 'loadComponent' | 'component' | 'redirectTo' | 'children' | 'loadChildren'>


export function routes(routingInfo: Required<AngularRouting>) {
  const router = new Bun.FileSystemRouter({
    style: "nextjs",
    dir: routingInfo.pagesPath,
  });

  console.log('routes', router.routes)

  const routingMapper: RoutingMapper = { imports: [], routes: [] }

  Object.keys(router.routes).forEach((key, index) => {
    routingMapper.imports.push(`import {routerMeta as r${index}} from './${relative(dirname(routingInfo.filePath), router.routes[key])}'`);
    routingMapper.routes.push(`{
    path: '${key.replace(/\[(.*?)\]/g, ':$1').substring(1)}',
    loadComponent: () => import('./${relative(dirname(routingInfo.filePath), router.routes[key])}'),
    ...r${index},
  }`);
  })



  const redirectRoute = `
  {
    path: '',
    redirectTo: '${routingInfo.redirectTo}',
    pathMatch: 'full',
  },
`

  const content = `
${routingMapper.imports.join(`\n`)
    }

export const routes = [
  ${routingInfo.redirectTo ? redirectRoute : ''}
  ${routingMapper.routes.join(',\n')}
]
`;
console.log('content', content)
  return content;
}


export const AngularRoutesRunTime: BunPlugin = {
  name: "Angular Bun routing loader",
  setup(build) {  
      build.module("virtual:angular-routing:bun", () => {
        const router = new Bun.FileSystemRouter({
            style: "nextjs",
            dir: "src/app/pages",
          });

          const routingMapper: RoutingMapper = {imports: [], routes:[]} 

          Object.keys(router.routes).forEach((key, index) => {
            routingMapper.imports.push(`import {RouterMeta as r${index}} from './${router.routes[key]}'`);
            routingMapper.routes.push(`{
                path: '${key.replace(/\[(.*?)\]/g, ':$1').substring(1)}',
                // loadComponent: () => import('./${relative(__dirname, router.routes[key]).replace('../', '')}'),
                ...r${index}
            }`);
          })
            

        const content = `
        ${
            routingMapper.imports.join(`\n`)
        }

        export const bunRoutes = [
          ${routingMapper.routes.join(',\n')}
        ]
      `;
      console.log('content', content)
        return {
          contents:content,
          loader: "ts",
        };
      });
  },
};


export const AngularRoutesBuild:(routingInfo?: AngularRouting) => BunPlugin = (routingInfo = {}) => ({
  name: "Angular Bun routing loader",
  setup(build) {
    const routePath = routingInfo.filePath ?? 'src/app/app.routes.ts'
    const pagesPath = routingInfo.pagesPath ?? 'src/app/pages';
    const transpiler = new Transpiler({ loader: "ts" });

    build.onLoad({filter: new RegExp(routePath, 'i') }, (args) => {

      return {
        contents: routes({
          ...routingInfo,
          filePath: routePath,
          pagesPath: pagesPath
        } as any),
        loader: 'js'
      } 

  
    });
  },
});

plugin(AngularRoutesBuild({redirectTo: 'post/1'}));