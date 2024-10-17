/**
 * @module fs
 */

import rspack from '@rspack/core';
import fs, { Stats } from 'node:fs';
import { GetProp } from '/server/interface';
import { createFsFromVolume, Volume } from 'memfs';

type Compiler = rspack.Compiler;

type FileStats = Stats | null | undefined;

export interface FileSystem extends GetProp<Compiler, 'outputFileSystem'> {
  open: typeof fs.open;
  read: typeof fs.read;
  close: typeof fs.close;
}

/**
 * @function createMemfs
 * @description Create memfs instance.
 */
export function createMemfs(): FileSystem {
  const volume = new Volume();

  return createFsFromVolume(volume) as unknown as FileSystem;
}

/**
 * @function stat
 * @description Get file stats.
 * @param fs The file system to used.
 * @param path The file path.
 */
export function stat(fs: FileSystem, path: string): Promise<FileStats> {
  return new Promise(resolve => {
    fs.stat(path, (error, stats) => {
      resolve(error != null ? null : stats);
    });
  });
}
