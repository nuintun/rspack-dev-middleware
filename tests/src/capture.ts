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
      svg.style.margin = '0px';
      svg.style.border = 'none';
      svg.style.padding = '0px';
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
      cutout.setAttribute('stroke', '#fff');
      cutout.setAttribute('stroke-width', '2');
      cutout.setAttribute('stroke-dashoffset', '0');
      cutout.setAttribute('stroke-dasharray', '5, 5');

      const animate = document.createElementNS(namespace, 'animate');

      animate.setAttribute('to', '10');
      animate.setAttribute('from', '0');
      animate.setAttribute('dur', '0.5s');
      animate.setAttribute('repeatCount', 'indefinite');
      animate.setAttribute('attributeName', 'stroke-dashoffset');

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

          cutout.setAttribute('width', '0');
          cutout.setAttribute('height', '0');
          cutout.setAttribute('x', startX.toString());
          cutout.setAttribute('y', startY.toString());
        }
      };

      const mousemove: MouseEventHandler = event => {
        if (capturing) {
          event.preventDefault();

          const { clientWidth, clientHeight } = documentElement;
          const clientX = Math.max(0, Math.min(clientWidth, event.clientX));
          const clientY = Math.max(0, Math.min(clientHeight, event.clientY));

          cutout.setAttribute('x', Math.min(startX, clientX).toString());
          cutout.setAttribute('y', Math.min(startY, clientY).toString());
          cutout.setAttribute('width', Math.abs(clientX - startX).toString());
          cutout.setAttribute('height', Math.abs(clientY - startY).toString());
        }
      };

      const mouseup: MouseEventHandler = event => {
        if (event.button === 0) {
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

      cutout.append(animate);
      mask.append(background, cutout);
      svg.append(mask, backdrop);

      stage.attachShadow({ mode: 'closed' }).append(svg);

      document.body.append(stage);
    });
  }

  return promise;
}
