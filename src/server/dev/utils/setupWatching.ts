/**
 * @module setupWatching
 */

import { isMultiCompiler } from '/server/utils';
import { ErrorCallback, InitialContext } from '/server/dev/interface';

export function setupWatching(context: InitialContext): void {
  const { compiler, logger } = context;

  const errorHandler: ErrorCallback = error => {
    if (error != null) {
      // For example - `writeToDisk` can throw an error and right now it is ends watching.
      // We can improve that and keep watching active, but it is require API on webpack side.
      // Let's implement that in webpack@5 because it is rare case.
      logger.error(error);
    }
  };

  if (isMultiCompiler(compiler)) {
    const watchOptions = compiler.compilers.map(({ options }) => {
      return options.watchOptions;
    });

    context.watching = compiler.watch(watchOptions, errorHandler);
  } else {
    // Reuse existing watching if present, otherwise start watching.
    context.watching = compiler.watching ?? compiler.watch(compiler.options.watchOptions, errorHandler);
  }
}
