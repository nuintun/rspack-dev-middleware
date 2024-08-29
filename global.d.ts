/**
 * @module global.d.ts
 */

/// <reference types="@rspack/core/module" />

declare const __HOT_CLIENT__: string;

declare type HotUpdateStatus = `${Rspack.HotUpdateStatus}`;
