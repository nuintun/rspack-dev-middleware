/**
 * @module message
 */

import * as rspack from '@rspack/core';

export interface Messages {
  ok: {
    timestamp: number;
  };
  hash: {
    hash: string;
    timestamp: number;
  };
  invalid: {
    timestamp: number;
    path: string | null;
  };
  progress: {
    stage: string;
    percent: number;
    details: {
      builtModules: number;
      moduleIdentifier?: string;
    };
  };
  issues: {
    timestamp: number;
    errors: rspack.StatsError[];
    warnings: rspack.StatsError[];
  };
}

export type Message = {
  [A in keyof Messages]: { action: A; payload: Messages[A] };
}[keyof Messages];
