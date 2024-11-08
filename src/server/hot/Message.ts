/**
 * @module message
 */

import * as rspack from '@rspack/core';
import { GetProp } from '/server/interface';

export interface Invalid {
  action: 'invalid';
  payload: {
    timestamp: number;
    path: string | null;
  };
}

export interface Progress {
  action: 'progress';
  payload: {
    status: string;
    messages: string[];
    percentage: number;
  };
}

export interface Hash {
  action: 'hash';
  payload: {
    hash: string;
    timestamp: number;
  };
}

export interface Issues {
  action: 'issues';
  payload: {
    timestamp: number;
    errors: rspack.StatsError[];
    warnings: rspack.StatsError[];
  };
}

export interface Ok {
  action: 'ok';
  payload: {
    timestamp: number;
  };
}

export interface Messages {
  ok: GetProp<Ok, 'payload'>;
  hash: GetProp<Hash, 'payload'>;
  issues: GetProp<Issues, 'payload'>;
  invalid: GetProp<Invalid, 'payload'>;
  progress: GetProp<Progress, 'payload'>;
}

export type Message = Invalid | Progress | Hash | Issues | Ok;
