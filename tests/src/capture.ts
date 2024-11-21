/**
 * @module capture
 */

import cross from './images/cross.cur';

interface MouseEventHandler {
  (event: MouseEvent): void;
}

interface KeyboardEventHandler {
  (event: KeyboardEvent): void;
}

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
      const namespace = 'http://www.w3.org/2000/svg';
      const stage = document.createElement('svg-screenshot');
      const svg = document.createElementNS(namespace, 'svg');

      svg.style.top = '0px';
      svg.style.left = '0px';
      svg.style.position = 'fixed';
      svg.style.zIndex = '2147483647';
      svg.style.cursor = `url(${cross}), auto`;

      svg.id = 'svg-screenshot-selector';

      const mask = document.createElementNS(namespace, 'mask');

      mask.id = 'svg-screenshot-cutout';

      const background = document.createElementNS(namespace, 'rect');

      background.setAttribute('x', '0');
      background.setAttribute('y', '0');
      background.setAttribute('fill', '#fff');

      const cutout = document.createElementNS(namespace, 'rect');

      cutout.setAttribute('x', '0');
      cutout.setAttribute('y', '0');
      cutout.setAttribute('width', '0');
      cutout.setAttribute('height', '0');
      cutout.setAttribute('fill', '#000');

      const backdrop = document.createElementNS(namespace, 'rect');

      backdrop.setAttribute('x', '0');
      backdrop.setAttribute('y', '0');
      backdrop.setAttribute('fill', 'rgba(0, 0, 0, 0.5)');
      backdrop.setAttribute('mask', 'url(#svg-screenshot-cutout)');

      const observer = new ResizeObserver(entries => {
        for (const { target } of entries) {
          if (target === documentElement) {
            const width = documentElement.clientWidth.toString();
            const height = documentElement.clientHeight.toString();

            svg.style.width = `${width}px`;
            svg.style.height = `${height}px`;

            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

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
          cleanup();

          reject(new AbortError('aborted with escape'));
        }
      };

      const mousedown: MouseEventHandler = event => {
        event.preventDefault();

        capturing = true;

        startX = event.clientX;
        startY = event.clientY;

        cutout.setAttribute('width', '0');
        cutout.setAttribute('height', '0');
        cutout.setAttribute('x', startX.toString());
        cutout.setAttribute('y', startY.toString());
      };

      const mousemove: MouseEventHandler = event => {
        if (capturing) {
          event.preventDefault();

          const { clientX, clientY } = event;
          const { clientWidth, clientHeight } = documentElement;
          const width = Math.min(clientWidth, Math.abs(clientX - startX));
          const height = Math.min(clientHeight, Math.abs(clientY - startY));

          cutout.setAttribute('width', width.toString());
          cutout.setAttribute('height', height.toString());
          cutout.setAttribute('x', Math.min(startX, clientX).toString());
          cutout.setAttribute('y', Math.min(startY, clientY).toString());
        }
      };

      const mouseup: MouseEventHandler = event => {
        event.preventDefault();

        // Note: Need to build the DOMRect from the properties,
        // getBoundingClientRect() returns collapsed rectangle in Firefox.
        const rect = new DOMRectReadOnly(
          cutout.x.baseVal.value,
          cutout.y.baseVal.value,
          cutout.width.baseVal.value,
          cutout.height.baseVal.value
        );

        cleanup();

        resolve(rect);
      };

      const cleanup = () => {
        promise = null;
        capturing = false;

        observer.unobserve(documentElement);

        window.removeEventListener('keyup', escape, true);
        window.removeEventListener('mousedown', mousedown, true);
        window.removeEventListener('mousemove', mousemove, true);
        window.removeEventListener('mouseup', mouseup, true);

        stage.remove();
      };

      observer.observe(documentElement);

      window.addEventListener('keyup', escape, true);
      window.addEventListener('mousedown', mousedown, true);
      window.addEventListener('mousemove', mousemove, true);
      window.addEventListener('mouseup', mouseup, true);

      mask.append(background, cutout);
      svg.append(mask, backdrop);

      stage.attachShadow({ mode: 'closed' }).append(svg);

      document.body.append(stage);
    });
  }

  return promise;
}
