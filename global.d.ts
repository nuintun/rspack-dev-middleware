/**
 * @module global.d.ts
 */

/// <reference types="@types/node" />
/// <reference types="@rspack/core/module" />

declare module '*.svg' {
  const content: string;

  export = content;
}

declare const __HOT_CLIENT__: string;

declare const __PLUGIN_NAME__: string;

declare type HotUpdateStatus = `${Rspack.HotUpdateStatus}`;
