/**
 * @module global
 */

/// <reference types="react" />
/// <reference types="../global.d.ts" />
/// <reference types="@rspack/core/module" />

declare module '*.module.css' {
  const content: {
    readonly [name: string]: string;
  };

  export default content;
}

declare module '*.css' {
  const content: string;

  export default content;
}

declare module '*.svg' {
  const content: string;

  export default content;
}

declare module '*.mp4' {
  const content: string;

  export default content;
}

declare module 'rspack-dev-middleware/client' {
  export = import('../types/client/index');
}
