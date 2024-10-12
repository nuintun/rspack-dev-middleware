/**
 * @module rollup.base
 */

import url from '@rollup/plugin-url';
import metaURL from './plugins/meta-url.js';
import replace from '@rollup/plugin-replace';
import treeShake from './plugins/tree-shake.js';
import webpackHot from './plugins/webpack-hot.js';
import typescript from '@rollup/plugin-typescript';
import { createRequire, isBuiltin } from 'node:module';

const pkg = createRequire(import.meta.url)('../package.json');

const externals = [
  // Dependencies
  ...Object.keys(pkg.dependencies || {}),
  // Peer dependencies
  ...Object.keys(pkg.peerDependencies || {})
];

const banner = `/**
  * @package ${pkg.name}
  * @license ${pkg.license}
  * @version ${pkg.version}
  * @author ${pkg.author.name} <${pkg.author.email}>
  * @description ${pkg.description}
  * @see ${pkg.homepage}
  */
 `;

/**
 * @function env
 * @param {boolean} esnext
 * @return {import('rollup').Plugin}
 */
function env(esnext) {
  const ext = esnext ? 'js' : 'cjs';
  const client = `../../client/main.${ext}`;

  return replace({
    preventAssignment: true,
    values: {
      __HOT_CLIENT__: JSON.stringify(client),
      __PLUGIN_NAME__: JSON.stringify(pkg.name)
    }
  });
}

/**
 * @function rollup
 * @param {boolean} [esnext]
 * @return {import('rollup').RollupOptions[]}
 */
export default function rollup(esnext) {
  return [
    {
      input: 'src/server/index.ts',
      output: {
        banner,
        esModule: false,
        exports: 'auto',
        interop: 'auto',
        preserveModules: true,
        format: esnext ? 'esm' : 'cjs',
        generatedCode: { constBindings: true },
        dir: esnext ? 'esm/server' : 'cjs/server',
        entryFileNames: `[name].${esnext ? 'js' : 'cjs'}`,
        chunkFileNames: `[name].${esnext ? 'js' : 'cjs'}`
      },
      plugins: [env(esnext), metaURL(esnext), typescript(), treeShake()],
      onwarn(error, warn) {
        if (error.code !== 'CIRCULAR_DEPENDENCY') {
          warn(error);
        }
      },
      external(source) {
        if (isBuiltin(source)) {
          return true;
        }

        for (const external of externals) {
          if (source === external || source.startsWith(`${external}/`)) {
            return true;
          }
        }

        return false;
      }
    },
    {
      input: ['src/client/main.ts', 'src/client/index.ts'],
      output: {
        banner,
        esModule: false,
        exports: 'auto',
        interop: 'auto',
        preserveModules: true,
        format: esnext ? 'esm' : 'cjs',
        generatedCode: { constBindings: true },
        dir: esnext ? 'esm/client' : 'cjs/client',
        entryFileNames: `[name].${esnext ? 'js' : 'cjs'}`,
        chunkFileNames: `[name].${esnext ? 'js' : 'cjs'}`
      },
      plugins: [url({ limit: Infinity }), webpackHot(esnext), typescript(), treeShake()],
      onwarn(error, warn) {
        if (error.code !== 'CIRCULAR_DEPENDENCY') {
          warn(error);
        }
      },
      external(source) {
        if (isBuiltin(source)) {
          return true;
        }

        for (const external of externals) {
          if (source === external || source.startsWith(`${external}/`)) {
            return true;
          }
        }

        return false;
      }
    }
  ];
}
