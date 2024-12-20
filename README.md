# rspack-dev-middleware

<!-- prettier-ignore -->
> A koa 2 middleware for rspack development and hot reloading.
>
> [![NPM Version][npm-image]][npm-url]
> [![Download Status][download-image]][npm-url]
> [![Languages Status][languages-image]][github-url]
> [![Tree Shakeable][tree-shakeable-image]][bundle-phobia-url]
> [![Side Effect][side-effect-image]][bundle-phobia-url]
> [![License][license-image]][license-url]

### Usage

```ts
/**
 * @module rspack
 * @description Rspack config.
 */

import Koa from 'koa';
import memfs from 'memfs';
import path from 'node:path';
import rspack from '@rspack/core';
import compress from 'koa-compress';
import { server as dev } from 'rspack-dev-middleware';
import ReactRefreshPlugin from '@rspack/plugin-react-refresh';

const entryHTML = path.resolve('wwwroot/index.html');

function createMemfs() {
  const volume = new memfs.Volume();
  const fs = memfs.createFsFromVolume(volume);

  return fs;
}

function httpError(error) {
  return /^(EOF|EPIPE|ECANCELED|ECONNRESET|ECONNABORTED)$/i.test(error.code);
}

const html = {
  minify: true,
  title: 'Rspack',
  filename: entryHTML,
  templateParameters: { lang: 'en' },
  template: path.resolve('index.ejs'),
  favicon: path.resolve('src/images/favicon.png'),
  meta: { 'theme-color': '#4285f4', viewport: 'width=device-width,initial-scale=1.0' }
};

const compiler = rspack({
  name: 'React',
  mode: 'development',
  context: path.resolve('src'),
  entry: path.resolve('src/index.tsx'),
  output: {
    publicPath: '/public/',
    filename: `js/[name].js`,
    chunkFilename: `js/[name].js`,
    path: path.resolve('wwwroot/public'),
    assetModuleFilename: `[path][name][ext]`
  },
  experiments: {
    css: true
  },
  watchOptions: {
    aggregateTimeout: 256
  },
  stats: {
    colors: true,
    chunks: false,
    children: false,
    entrypoints: false,
    runtimeModules: false,
    dependentModules: false
  },
  devtool: 'eval-cheap-module-source-map',
  resolve: {
    fallback: { url: false },
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    parser: {
      'css/auto': {
        namedExports: true
      }
    },
    generator: {
      'css/auto': {
        localIdentName: '[local]-[hash:8]',
        exportsConvention: 'camel-case-only'
      }
    },
    rules: [
      {
        test: /\.[jt]sx?$/i,
        type: 'javascript/auto',
        loader: 'builtin:swc-loader',
        exclude: /[\\/]node_modules[\\/]/,
        options: {
          jsc: {
            externalHelpers: true,
            parser: {
              tsx: true,
              syntax: 'typescript'
            },
            transform: {
              react: {
                refresh: true,
                runtime: 'automatic'
              }
            }
          },
          env: {
            targets: ['defaults', 'not IE >= 0']
          }
        }
      },
      {
        test: /\.css$/i,
        type: 'css/auto',
        exclude: /[\\/]node_modules[\\/]/
      },
      {
        type: 'asset/resource',
        test: /\.(cur|svg|png|mp4)$/i,
        exclude: /[\\/]node_modules[\\/]/
      }
    ]
  },
  plugins: [
    new ReactRefreshPlugin(),
    new rspack.ProgressPlugin({
      prefix: '[Rspack]',
      progressChars: '█▒'
    }),
    new rspack.HtmlRspackPlugin(html)
  ]
});

const port = 8000;
const app = new Koa();
const fs = createMemfs();
const server = dev(compiler, {
  fs,
  headers: {
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  }
});

app.use(
  compress({
    br: false
  })
);

app.use(server);

app.use(async ctx => {
  ctx.type = 'text/html; charset=utf-8';
  ctx.body = fs.createReadStream(entryHTML);
});

app.on('error', error => {
  !httpError(error) && console.error(error);
});

app.listen(port, () => {
  server.ready(() => {
    server.logger.info(`server run at: \u001B[36mhttp://127.0.0.1:${port}\u001B[0m`);
  });
});
```

### Screenshot

![Screenshot](https://raw.githubusercontent.com/nuintun/rspack-dev-middleware/main/screenshot.png)

[npm-image]: https://img.shields.io/npm/v/rspack-dev-middleware?style=flat-square
[npm-url]: https://www.npmjs.org/package/rspack-dev-middleware
[download-image]: https://img.shields.io/npm/dm/rspack-dev-middleware?style=flat-square
[languages-image]: https://img.shields.io/github/languages/top/nuintun/rspack-dev-middleware?style=flat-square
[github-url]: https://github.com/nuintun/rspack-dev-middleware
[tree-shakeable-image]: https://img.shields.io/badge/tree--shakeable-true-brightred?style=flat-square
[side-effect-image]: https://img.shields.io/badge/side--effect-true-yellow?style=flat-square
[bundle-phobia-url]: https://bundlephobia.com/result?p=rspack-dev-middleware
[license-image]: https://img.shields.io/github/license/nuintun/rspack-dev-middleware?style=flat-square
[license-url]: https://github.com/nuintun/rspack-dev-middleware/blob/main/LICENSE
