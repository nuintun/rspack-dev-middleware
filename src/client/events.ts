/**
 * @module events
 */

import { Options } from './client';
import { GetProp } from '/server/interface';
import { Messages } from '/server/hot/Message';

const events: Listeners = {
  ok: [],
  hash: [],
  issues: [],
  invalid: [],
  progress: []
};

type Listeners = {
  [E in keyof Events]: GetProp<Events, E>[];
};

export type Events = {
  [E in keyof Messages]: (message: Messages[E], options: Options) => void;
};

/**
 * @function on
 * @description Add an event listener callback.
 * @param event Event name.
 * @param callback Event listener callback.
 */
export function on<E extends keyof Events>(event: E, callback: GetProp<Events, E>): void {
  const callbacks = events[event];

  if (callbacks != null) {
    callbacks.push(callback);
  }
}

/**
 * @function off
 * @description Remove an event listener callback.
 * @param event Event name.
 * @param callback Event listener callback.
 */
export function off<E extends keyof Events>(event: E, callback?: GetProp<Events, E>): void {
  const callbacks = events[event];

  if (callbacks != null) {
    if (callback != null) {
      const index = callbacks.indexOf(callback);

      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    } else {
      events[event] = [];
    }
  }
}

export function emit<E extends keyof Events>(event: E, message: GetProp<Messages, E>, options: Options): void {
  const callbacks = events[event];

  if (callbacks != null && callbacks.length > 0) {
    for (const callback of callbacks) {
      callback(message as any, options);
    }
  }
}
