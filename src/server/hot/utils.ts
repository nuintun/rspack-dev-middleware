/**
 * @module utils
 */

import { Context } from 'koa';
import rspack from '@rspack/core';
import { Options } from './interface';
import { UnionCompiler } from '/server/interface';
import { isMultiCompiler, isObject } from '/server/utils';

export function isUpgradable({ request }: Context): boolean {
  const upgrade = request.get('Upgrade');

  return !!upgrade && /^websocket$/i.test(upgrade.trim());
}

function normalize(path: string): string {
  const segments: string[] = [];
  const parts = path.split(/[\\/]+/);

  for (const segment of parts) {
    switch (segment) {
      case '.':
        break;
      case '..':
        segments.pop();
        break;
      default:
        segments.push(segment);
        break;
    }
  }

  const pathname = segments.join('/');

  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function getOptions(options?: Options): Required<Options> {
  const settings = {
    hmr: true,
    wss: false,
    path: '/hot',
    reload: true,
    overlay: true,
    progress: true,
    ...options
  };

  settings.path = normalize(settings.path);

  return settings;
}

export function hasIssues<T>(issues: ArrayLike<T> | undefined): boolean {
  return Array.isArray(issues) && issues.length > 0;
}

function normalizeStatsOptions(statsOptions?: rspack.StatsValue): rspack.StatsOptions {
  if (!isObject(statsOptions)) {
    statsOptions = {
      preset: statsOptions
    };
  }

  return {
    ...statsOptions,
    all: false,
    hash: true,
    colors: true,
    errors: true,
    assets: false,
    builtAt: true,
    warnings: true,
    errorDetails: false
  };
}

export function getStatsOptions(compiler: UnionCompiler): rspack.StatsOptions {
  if (isMultiCompiler(compiler)) {
    return {
      children: compiler.compilers.map(({ options }) => {
        return normalizeStatsOptions(options.stats);
      })
    } as unknown as rspack.StatsOptions;
  }

  return normalizeStatsOptions(compiler.options.stats);
}

export function getTimestamp({ builtAt, children = [] }: rspack.StatsCompilation): number {
  if (builtAt != null) {
    return builtAt;
  }

  let timestamp = -1;

  for (const { builtAt = timestamp } of children) {
    if (builtAt > timestamp) {
      timestamp = builtAt;
    }
  }

  return timestamp < 0 ? Date.now() : timestamp;
}
