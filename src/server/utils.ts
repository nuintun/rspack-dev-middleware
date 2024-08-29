/**
 * @module utils
 */

import rspack from '@rspack/core';
import { ICompiler } from './interface';

const { toString } = Object.prototype;

export const PLUGIN_NAME = 'rspack-dev-middleware';

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

export function getCompilers(compiler: ICompiler): rspack.Compiler[] {
  if (isMultiCompiler(compiler)) {
    return compiler.compilers;
  }

  return [compiler];
}

export function isMultiCompiler(compiler: ICompiler): compiler is rspack.MultiCompiler {
  return compiler instanceof rspack.MultiCompiler;
}
