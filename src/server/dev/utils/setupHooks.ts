/**
 * @module setupHooks
 */

import * as rspack from '@rspack/core';
import supportsColor from 'supports-color';
import { UnionStats } from '/server/interface';
import { InitialContext } from '/server/dev/interface';
import { isBoolean, isMultiCompiler, isString, PLUGIN_NAME } from '/server/utils';

function normalizeStatsOptions(statsOptions?: rspack.StatsValue): rspack.StatsOptions {
  if (statsOptions == null) {
    return { preset: 'normal' };
  } else if (isString(statsOptions)) {
    return { preset: statsOptions };
  } else if (isBoolean(statsOptions)) {
    return statsOptions ? { preset: 'normal' } : { preset: 'none' };
  }

  if (statsOptions.colors == null) {
    const { stdout, stderr } = supportsColor;

    statsOptions.colors = stdout !== false && stderr !== false;
  }

  return statsOptions;
}

function getStatsOptions(context: InitialContext): rspack.StatsOptions {
  const { compiler } = context;
  const { stats } = context.options;

  if (stats != null) {
    if (isMultiCompiler(compiler)) {
      return {
        children: compiler.compilers.map(() => {
          return normalizeStatsOptions(stats);
        })
      } as unknown as rspack.StatsOptions;
    }

    return normalizeStatsOptions(stats);
  }

  if (isMultiCompiler(compiler)) {
    return {
      children: compiler.compilers.map(({ options }) => {
        return normalizeStatsOptions(options.stats);
      })
    } as unknown as rspack.StatsOptions;
  }

  return normalizeStatsOptions(compiler.options.stats);
}

export function setupHooks(context: InitialContext): void {
  const { hooks } = context.compiler;
  const statsOptions = getStatsOptions(context);

  const invalid = (): void => {
    // We are now in invalid state.
    context.stats = null;

    // Log compilation starting.
    context.logger.log('compilation starting...');
  };

  const {
    onCompilationDone = (stats: UnionStats, statsOptions: rspack.StatsOptions): void => {
      const printedStats = stats.toString(statsOptions);

      // Avoid extra empty line when `stats: 'none'`.
      if (printedStats) {
        context.logger.info(`build stats:\n${printedStats}`);
      }
    }
  } = context.options;

  const done = (stats: UnionStats): void => {
    // We are now on valid state
    context.stats = stats;

    // Do the stuff in nextTick, because bundle may be invalidated if a change happened while compiling.
    process.nextTick(() => {
      const { stats } = context;

      // Check if still in valid state.
      if (stats) {
        // Call onCompilationDone.
        onCompilationDone(stats, statsOptions);

        // Callbacks.
        const { callbacks } = context;

        // Clear callbacks.
        context.callbacks = [];

        // Call callbacks.
        for (const callback of callbacks) {
          callback(stats);
        }

        // Log compilation finished.
        context.logger.log('compilation finished');
      }
    });
  };

  hooks.done.tap(PLUGIN_NAME, done);
  hooks.invalid.tap(PLUGIN_NAME, invalid);
}
