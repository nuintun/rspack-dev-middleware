/**
 * @module interface
 */

import WebSocket from 'ws';
import * as rspack from '@rspack/core';
import { RequiredKeys } from '/server/interface';

export interface Options {
  hmr?: boolean;
  path?: string;
  wss?: boolean;
  reload?: boolean;
  overlay?: boolean;
  progress?: boolean;
}

export type Clients = Set<WebSocket>;

export interface CompilerContext {
  percentage: number;
  readonly uuid: string;
  readonly clients: Clients;
  stats: Required<rspack.StatsCompilation> | null;
}

export type NormalizedOptions = RequiredKeys<Options, 'hmr' | 'path' | 'reload' | 'overlay' | 'progress'>;
