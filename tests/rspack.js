/**
 * @module rspack
 * @description Rspack config.
 */

import Koa from 'koa';
import path from 'node:path';
import rspack from '@rspack/core';
import compress from 'koa-compress';
import { Volume, createFsFromVolume } from 'memfs';
import { server as dev } from 'rspack-dev-middleware';
import ReactRefreshPlugin from '@rspack/plugin-react-refresh';

const entryHTML = path.resolve('wwwroot/index.html');

function createMemfs() {
  const volume = new Volume();

  return createFsFromVolume(volume);
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
  cache: true,
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
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  plugins: [
    new ReactRefreshPlugin(),
    new rspack.ProgressPlugin({
      prefix: '[Rspack]',
      progressChars: '█▒'
    }),
    new rspack.HtmlRspackPlugin(html),
    new rspack.WarnCaseSensitiveModulesPlugin()
  ],
  watchOptions: {
    aggregateTimeout: 256
  },
  stats: {
    all: false,
    assets: true,
    colors: true,
    errors: true,
    timings: true,
    version: true,
    warnings: true,
    errorsCount: true,
    warningsCount: true,
    groupAssetsByPath: true
  },
  devtool: 'eval-cheap-module-source-map',
  experiments: {
    css: true,
    cache: {
      type: 'persistent',
      storage: {
        type: 'filesystem',
        directory: path.resolve('../node_modules/.cache/rspack')
      }
    }
  }
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
    server.logger.info(`server run at: \x1b[36mhttp://127.0.0.1:${port}\x1b[0m`);
  });
});
