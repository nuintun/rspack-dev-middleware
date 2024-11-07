/**
 * @module interface
 */

import * as rspack from '@rspack/core';

export type UnionStats = rspack.Stats | rspack.MultiStats;

export type GetProp<T, P extends keyof T> = NonNullable<T[P]>;

export type UnionCompiler = rspack.Compiler | rspack.MultiCompiler;

export type Logger = ReturnType<GetProp<rspack.Compiler, 'getInfrastructureLogger'>>;

export type UnionWatching = rspack.Watching | ReturnType<GetProp<rspack.MultiCompiler, 'watch'>>;

export type Optional<T extends object, K extends keyof T = keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
