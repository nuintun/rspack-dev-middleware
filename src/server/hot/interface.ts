/**
 * @module interface
 */

import WebSocket from 'ws';
import rspack from '@rspack/core';

export interface Options {
  hmr?: boolean;
  path?: string;
  wss?: boolean;
  reload?: boolean;
  overlay?: boolean;
  progress?: boolean;
}

export interface PluginFactory {
  (compiler: rspack.Compiler): rspack.RspackPluginInstance;
}

export interface Expose {
  readonly clients: () => Set<WebSocket>;
  readonly broadcast: <T>(clients: Set<WebSocket> | WebSocket[], action: string, payload: T) => void;
}
