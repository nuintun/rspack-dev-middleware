/**
 * @module utils
 */

import rspack from '@rspack/core';
import { UnionCompiler } from './interface';

const { toString } = Object.prototype;

export const PLUGIN_NAME = __PLUGIN_NAME__;

export function isObject(value: unknown): value is object {
  return toString.call(value) === '[object Object]';
}

export function isString(value: unknown): value is string {
  return toString.call(value) === '[object String]';
}

export function isBoolean(value: unknown): value is boolean {
  return toString.call(value) === '[object Boolean]';
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function getCompilers(compiler: UnionCompiler): rspack.Compiler[] {
  if (isMultiCompiler(compiler)) {
    return compiler.compilers;
  }

  return [compiler];
}

export function isMultiCompiler(compiler: UnionCompiler): compiler is rspack.MultiCompiler {
  return 'compilers' in compiler;
}
