/**
 * @module screenshot
 */

import crosshair from './images/crosshair.cur';

interface MouseEventHandler {
  (event: MouseEvent): void;
}

interface KeyboardEventHandler {
  (event: KeyboardEvent): void;
}

const COMPONENT_NAME = 'svg-screenshot';

class AbortError extends Error {
  public override readonly name = 'AbortError';

  constructor(message: string = 'Aborted') {
    super(message);
  }
}

let promise: Promise<DOMRectReadOnly> | null = null;

const CSS = `
.${COMPONENT_NAME},
.${COMPONENT_NAME}-marching-ants {
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  border: none;
  cursor: url(${crosshair}) 16 16, crosshair;
}

.${COMPONENT_NAME} {
  position: fixed;
  z-index: 2147483646;
}

@keyframes marching-ants {
  0% {
    background-position: 0 0, 0 100%, 0 0, 100% 0;
  }

  100% {
    background-position: 20px 0, -20px 100%, 0 -20px, 100% 20px;
  }
}

.${COMPONENT_NAME}-marching-ants {
  width: 0;
  height: 0;
  color: #fff;
  position: absolute;
  z-index: 2147483647;
  will-change: background-position;
  animation: marching-ants 1s linear infinite;
  background-position: 0 0, 0 100%, 0 0, 100% 0;
  background-image:
    linear-gradient(to right, #fff 50%, #000 50%),
    linear-gradient(to right, #fff 50%, #000 50%),
    linear-gradient(to bottom, #fff 50%, #000 50%),
    linear-gradient(to bottom, #fff 50%, #000 50%);
  background-size: 10px 1px, 10px 1px, 1px 10px, 1px 10px;
  background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
}
`;

export function selectCaptureArea(): Promise<DOMRectReadOnly> {
  if (promise === null) {
    promise = new Promise<DOMRectReadOnly>((resolve, reject) => {
      let startX = 0;
      let startY = 0;
      let capturing = false;

      const { documentElement } = document;
      const style = document.createElement('style');
      const namespace = 'http://www.w3.org/2000/svg';
      const stage = document.createElement(COMPONENT_NAME);
      const defs = document.createElementNS(namespace, 'defs');
      const shadowRoot = stage.attachShadow({ mode: 'closed' });
      const screenshot = document.createElementNS(namespace, 'svg');

      screenshot.classList.add(COMPONENT_NAME);

      screenshot.setAttribute('xmlns', namespace);

      const mask = document.createElementNS(namespace, 'mask');

      mask.id = `${COMPONENT_NAME}-selection`;

      const background = document.createElementNS(namespace, 'rect');

      background.setAttribute('x', '0');
      background.setAttribute('y', '0');
      background.setAttribute('fill', '#fff');

      const selection = document.createElementNS(namespace, 'rect');

      selection.setAttribute('x', '0');
      selection.setAttribute('y', '0');
      selection.setAttribute('width', '0');
      selection.setAttribute('height', '0');
      selection.setAttribute('fill', '#000');

      const backdrop = document.createElementNS(namespace, 'rect');

      backdrop.setAttribute('x', '0');
      backdrop.setAttribute('y', '0');
      backdrop.setAttribute('fill', 'rgba(0, 0, 0, 0.45)');
      backdrop.setAttribute('mask', `url(#${COMPONENT_NAME}-selection)`);

      const ants = document.createElement('div');

      ants.classList.add(`${COMPONENT_NAME}-marching-ants`);

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
          const x = Math.min(startX, clientX).toString();
          const y = Math.min(startY, clientY).toString();
          const width = Math.abs(clientX - startX).toString();
          const height = Math.abs(clientY - startY).toString();

          ants.style.top = `${y}px`;
          ants.style.left = `${x}px`;
          ants.style.width = `${width}px`;
          ants.style.height = `${height}px`;

          selection.setAttribute('x', x);
          selection.setAttribute('y', y);
          selection.setAttribute('width', width);
          selection.setAttribute('height', height);
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

      style.append(CSS);

      mask.append(background, selection);

      defs.append(mask);

      screenshot.append(defs, backdrop);

      shadowRoot.append(style, screenshot, ants);

      document.body.append(stage);
    });
  }

  return promise;
}
