/**
 * @module Progress
 * @see https://github.com/shellscape/webpack-plugin-serve
 * @see https://www.zhangxinxu.com/wordpress/2015/07/svg-circle-loading
 */

import logo from './images/rspack-logo.svg';
import { appendDOMString, getRootElement, insertCSSString } from './utils';

const DURATION = 256;
const PROGRESS = 'rdm-progress';
const PERIMETER = 2 * Math.PI * 44;

const CSS = `
.${PROGRESS} {
  width: 48px;
  right: 16px;
  height: 48px;
  bottom: 16px;
  display: block;
  font-size: 16px;
  position: fixed;
  cursor: default;
  user-select: none;
  font-style: normal;
  font-weight: normal;
  z-index: 2147483647;
  transform-origin: center;
  transform: scale(0) translateZ(0);
  transition: transform ${DURATION}ms ease-out;
}
.${PROGRESS}-show {
  transform: scale(1) translateZ(0);
}
.${PROGRESS}-track {
  stroke: #eded91;
  stroke-width: 8;
  stroke-linecap: round;
  fill: rgba(0, 0, 0, 0);
  stroke-dasharray: ${PERIMETER};
  stroke-dashoffset: ${PERIMETER};
  transition: stroke-dashoffset ${DURATION}ms linear;
  transform: matrix(0, -1, 1, 0, 0, 96) translateZ(0);
}
`;

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" class="${PROGRESS}" x="0" y="0" viewBox="0 0 96 96">
  <circle fill="#23272f" cx="50%" cy="50%" r="44" />
  <circle class="${PROGRESS}-track" cx="50%" cy="50%" r="44" />
  <image href="${logo}" x="16" y="23.0528" width="64" height="49.8944"/>
</svg>
`;

export class Progress {
  #timer?: number;
  #hidden: boolean = true;

  readonly #svg: SVGElement;
  readonly #track: SVGElement;

  constructor() {
    const root = getRootElement(PROGRESS);

    insertCSSString(CSS, root);

    [this.#svg] = appendDOMString('image/svg+xml', SVG, root);

    this.#track = this.#svg.querySelector(`.${PROGRESS}-track`)!;
  }

  public update(percentage: number): void {
    percentage = 1 - Math.max(0, Math.min(1, percentage));

    this.#track.style.strokeDashoffset = `${PERIMETER * percentage}`;
  }

  public show(): void {
    if (this.#hidden) {
      this.#hidden = false;

      clearTimeout(this.#timer);

      this.#svg.classList.add(`${PROGRESS}-show`);
    }
  }

  public hide(): void {
    if (this.#hidden) {
      this.update(0);
    } else {
      this.#hidden = true;

      this.#timer = self.setTimeout(() => {
        this.#timer = self.setTimeout(() => {
          this.update(0);
        }, DURATION);

        this.#svg.classList.remove(`${PROGRESS}-show`);
      }, DURATION);
    }
  }
}
