/**
 * @module webpack
 * @description Webpack config
 */

import Koa from 'koa';
import path from 'path';
import memfs from 'memfs';
import compress from 'koa-compress';
import { rspack } from '@rspack/core';
import dev from 'rspack-dev-middleware';
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
  title: 'React',
  filename: entryHTML,
  templateParameters: { lang: 'en' },
  template: path.resolve('index.ejs'),
  favicon: path.resolve('src/images/favicon.ico'),
  meta: { 'theme-color': '#4285f4', viewport: 'width=device-width,initial-scale=1.0' }
};

const compiler = rspack({
  name: 'react',
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
    css: true,
    lazyCompilation: true
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
        test: /\.(svg|mp4)$/i,
        type: 'asset/resource',
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
