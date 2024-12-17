/**
 * @module global
 */

/// <reference types="react" />
/// <reference types="@rspack/core/module" />

declare module '*.module.css' {
  const content: {
    readonly [name: string]: string;
  };

  export = content;
}

declare module '*.css' {
  const content: string;

  export = content;
}

declare module '*.cur' {
  const content: string;

  export = content;
}

declare module '*.svg' {
  const content: string;

  export = content;
}

declare module '*.mp4' {
  const content: string;

  export = content;
}

declare module 'rspack-dev-middleware/client' {
  const { on, off } = await import('../esm/client');

  export = { on, off };
}
