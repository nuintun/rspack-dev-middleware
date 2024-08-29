/**
 * @module interface
 */

import rspack from '@rspack/core';

export type IStats = rspack.Stats | rspack.MultiStats;

export type GetProp<T, P extends keyof T> = NonNullable<T[P]>;

export type ICompiler = rspack.Compiler | rspack.MultiCompiler;

export type IStatsOptions = GetProp<rspack.Configuration, 'stats'>;

export type ILogger = ReturnType<GetProp<rspack.Compiler, 'getInfrastructureLogger'>>;

export type IWatching = rspack.Watching | ReturnType<GetProp<rspack.MultiCompiler, 'watch'>>;

export type Optional<T extends object, K extends keyof T = keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
