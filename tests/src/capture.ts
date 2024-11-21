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

export function selectCaptureArea(): Promise<DOMRectReadOnly> {
  return new Promise<DOMRectReadOnly>((resolve, reject) => {
    let startX = 0;
    let startY = 0;
    let capturing = false;

    const namespace = 'http://www.w3.org/2000/svg';
    const stage = document.createElement('svg-screenshot');
    const svg = document.createElementNS(namespace, 'svg');

    svg.style.top = '0px';
    svg.style.left = '0px';
    svg.style.position = 'fixed';
    svg.style.cursor = `url(${cross}), auto`;
    svg.style.zIndex = '2147483647';

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
      const { documentElement } = document;

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

        const positionX = Math.min(startX, clientX);
        const positionY = Math.min(startY, clientY);

        cutout.setAttribute('x', positionX.toString());
        cutout.setAttribute('y', positionY.toString());
        cutout.setAttribute('width', Math.abs(clientX - startX).toString());
        cutout.setAttribute('height', Math.abs(clientY - startY).toString());
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
      capturing = false;

      observer.unobserve(document.documentElement);

      window.removeEventListener('keyup', escape);

      svg.removeEventListener('mousedown', mousedown);
      svg.removeEventListener('mousemove', mousemove);
      svg.removeEventListener('mouseup', mouseup);

      stage.remove();
    };

    window.addEventListener('keyup', escape);

    svg.addEventListener('mousedown', mousedown);
    svg.addEventListener('mousemove', mousemove);
    svg.addEventListener('mouseup', mouseup);

    observer.observe(document.documentElement);

    mask.append(background, cutout);
    svg.append(mask, backdrop);

    stage.attachShadow({ mode: 'closed' }).append(svg);

    document.body.append(stage);
  });
}
