/**
 * @module hot
 */

// Last error.
let lastError: Error;
// Last update hash.
let lastHash = __webpack_hash__;

// Webpack hot.
const webpackHot = import.meta.webpackHot;

// HMR status.
let status: HotUpdateStatus = webpackHot?.status() ?? 'idle';

/**
 * @function updateHash
 * @description Update webpack hash.
 * @param hash The new hash value.
 */
export function updateHash(hash: string): void {
  lastHash = hash;
}

/**
 * @function applyUpdate
 * @description Apply update.
 * @param hmr Whether to enable HMR.
 * @param fallback Fallback function when HMR fail.
 */
export function applyUpdate(hmr: boolean, fallback: (error?: Error) => void): void {
  // Update available.
  if (lastHash !== __webpack_hash__) {
    // HMR enabled.
    if (hmr && webpackHot != null) {
      switch (status) {
        case 'idle':
          // Update status.
          status = 'check';

          // Auto check and apply updates.
          webpackHot
            .check(true)
            .then(() => {
              // Update status.
              status = webpackHot.status();
            })
            .catch((error: Error) => {
              // Get status.
              const currentStatus = webpackHot.status();

              // Update status.
              switch (currentStatus) {
                case 'fail':
                case 'abort':
                  status = currentStatus;
                  break;
                default:
                  status = 'fail';
                  break;
              }

              // Cache error.
              lastError = error;

              // Call fallback.
              fallback(lastError);
            });
          break;
        case 'fail':
        case 'abort':
          // Call fallback.
          fallback(lastError);
          break;
      }
    } else {
      // HMR disabled.
      fallback();
    }
  }
}
