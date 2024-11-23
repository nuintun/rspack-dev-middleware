/**
 * @module capture
 */

import crosshair from './images/crosshair.cur';

interface MouseEventHandler {
  (event: MouseEvent): void;
}

interface KeyboardEventHandler {
  (event: KeyboardEvent): void;
}

const styleSheet = `
@keyframes ants {
  from {
    stroke-dashoffset: 0;
  }

  to {
    stroke-dashoffset: -10;
  }
}

.selection {
  animation: ants 0.5s linear infinite;
}

.screenshot {
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  border: none;
  position: fixed;
  z-index: 2147483647;
  cursor: url(${crosshair}) 16 16, crosshair;
}
`;

class AbortError extends Error {
  public override readonly name = 'AbortError';

  constructor(message: string = 'Aborted') {
    super(message);
  }
}

let promise: Promise<DOMRectReadOnly> | null = null;

export function selectCaptureArea(): Promise<DOMRectReadOnly> {
  if (promise === null) {
    promise = new Promise<DOMRectReadOnly>((resolve, reject) => {
      let startX = 0;
      let startY = 0;
      let capturing = false;

      const { documentElement } = document;
      const style = document.createElement('style');
      const namespace = 'http://www.w3.org/2000/svg';
      const stage = document.createElement('svg-screenshot');
      const shadowRoot = stage.attachShadow({ mode: 'closed' });
      const screenshot = document.createElementNS(namespace, 'svg');

      screenshot.classList.add('screenshot');

      const mask = document.createElementNS(namespace, 'mask');

      mask.id = 'selection-mask';

      const background = document.createElementNS(namespace, 'rect');

      background.setAttribute('x', '0');
      background.setAttribute('y', '0');
      background.setAttribute('fill', '#fff');

      const selection = document.createElementNS(namespace, 'rect');

      selection.classList.add('selection');

      selection.setAttribute('x', '0');
      selection.setAttribute('y', '0');
      selection.setAttribute('width', '0');
      selection.setAttribute('height', '0');
      selection.setAttribute('fill', '#000');
      selection.setAttribute('stroke', '#fff');
      selection.setAttribute('stroke-width', '2');
      selection.setAttribute('stroke-dashoffset', '0');
      selection.setAttribute('stroke-dasharray', '6, 4');

      const backdrop = document.createElementNS(namespace, 'rect');

      backdrop.setAttribute('x', '0');
      backdrop.setAttribute('y', '0');
      backdrop.setAttribute('fill', 'rgba(0, 0, 0, 0.5)');
      backdrop.setAttribute('mask', 'url(#selection-mask)');

      const observer = new ResizeObserver(entries => {
        for (const { target } of entries) {
          if (target === documentElement) {
            const width = documentElement.clientWidth.toString();
            const height = documentElement.clientHeight.toString();

            screenshot.setAttribute('width', width);
            screenshot.setAttribute('height', height);
            screenshot.setAttribute('viewBox', `0 0 ${width} ${height}`);

            background.setAttribute('width', width);
            background.setAttribute('height', height);

            backdrop.setAttribute('width', width);
            backdrop.setAttribute('height', height);
            break;
          }
        }
      });

      const escape: KeyboardEventHandler = event => {
        if (!capturing && event.key === 'Escape') {
          event.preventDefault();

          cleanup();

          reject(new AbortError('aborted with escape'));
        }
      };

      const contextmenu: MouseEventHandler = event => {
        event.preventDefault();
      };

      const mousedown: MouseEventHandler = event => {
        if (event.button === 0) {
          event.preventDefault();

          capturing = true;

          startX = event.clientX;
          startY = event.clientY;

          selection.setAttribute('width', '0');
          selection.setAttribute('height', '0');
          selection.setAttribute('x', startX.toString());
          selection.setAttribute('y', startY.toString());
        }
      };

      const mousemove: MouseEventHandler = event => {
        if (capturing) {
          event.preventDefault();

          const { clientWidth, clientHeight } = documentElement;
          const clientX = Math.max(0, Math.min(clientWidth, event.clientX));
          const clientY = Math.max(0, Math.min(clientHeight, event.clientY));

          selection.setAttribute('x', Math.min(startX, clientX).toString());
          selection.setAttribute('y', Math.min(startY, clientY).toString());
          selection.setAttribute('width', Math.abs(clientX - startX).toString());
          selection.setAttribute('height', Math.abs(clientY - startY).toString());
        }
      };

      const mouseup: MouseEventHandler = event => {
        if (event.button === 0) {
          event.preventDefault();

          // Note: Need to build the DOMRect from the properties,
          // getBoundingClientRect() returns collapsed rectangle in Firefox.
          const rect = new DOMRectReadOnly(
            selection.x.baseVal.value,
            selection.y.baseVal.value,
            selection.width.baseVal.value,
            selection.height.baseVal.value
          );

          cleanup();

          resolve(rect);
        }
      };

      const cleanup = () => {
        promise = null;
        capturing = false;

        observer.unobserve(documentElement);

        window.removeEventListener('keyup', escape, true);
        window.removeEventListener('contextmenu', contextmenu, true);
        window.removeEventListener('mousedown', mousedown, true);
        window.removeEventListener('mousemove', mousemove, true);
        window.removeEventListener('mouseup', mouseup, true);

        stage.remove();
      };

      observer.observe(documentElement);

      window.addEventListener('keyup', escape, true);
      window.addEventListener('contextmenu', contextmenu, true);
      window.addEventListener('mousedown', mousedown, true);
      window.addEventListener('mousemove', mousemove, true);
      window.addEventListener('mouseup', mouseup, true);

      style.append(styleSheet);

      mask.append(background, selection);

      screenshot.append(mask, backdrop);

      shadowRoot.append(style, screenshot);

      document.body.append(stage);
    });
  }

  return promise;
}
