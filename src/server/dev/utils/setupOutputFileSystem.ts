/**
 * @module setupOutputFileSystem
 */

import { FileSystem } from './fs';
import { getCompilers } from '/server/utils';
import { createFsFromVolume, Volume } from 'memfs';
import { InitialContext } from '/server/dev/interface';

function createMemfs(): FileSystem {
  const volume = new Volume();

  // @ts-expect-error
  return createFsFromVolume(volume);
}

export function setupOutputFileSystem(context: InitialContext): void {
  const { fs = createMemfs() } = context.options;
  const compilers = getCompilers(context.compiler);

  for (const compiler of compilers) {
    compiler.outputFileSystem = fs;
  }

  context.fs = fs;
}
