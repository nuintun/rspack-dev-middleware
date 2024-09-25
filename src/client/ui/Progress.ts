/**
 * @module Progress
 * @see https://github.com/shellscape/webpack-plugin-serve
 * @see https://www.zhangxinxu.com/wordpress/2015/07/svg-circle-loading
 */

import logo from './images/rspack-logo.svg';
import { appendHTML, getRootElement, injectCSS } from './utils';

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

const HTML = `
<svg class="${PROGRESS}" x="0" y="0" viewBox="0 0 96 96">
  <circle fill="#23272f" cx="50%" cy="50%" r="44" />
  <circle class="${PROGRESS}-track" cx="50%" cy="50%" r="44" />
  <image href="${logo}" x="16" y="22.053" width="64" height="49.894"/>
</svg>
`;

export class Progress {
  private timer?: number;
  private hidden: boolean = true;

  private readonly svg: SVGElement;
  private readonly track: SVGElement;

  constructor() {
    const root = getRootElement(PROGRESS);

    injectCSS(CSS, root);

    [this.svg] = appendHTML(HTML, root) as [SVGElement];

    this.track = this.svg.querySelector(`.${PROGRESS}-track`)!;
  }

  update(percentage: number): void {
    percentage = 1 - Math.max(0, Math.min(1, percentage));

    this.track.style.strokeDashoffset = `${PERIMETER * percentage}`;
  }

  show(): void {
    if (this.hidden) {
      this.hidden = false;

      clearTimeout(this.timer);

      this.svg.classList.add(`${PROGRESS}-show`);
    }
  }

  hide(): void {
    if (this.hidden) {
      this.update(0);
    } else {
      this.hidden = true;

      this.timer = self.setTimeout(() => {
        this.timer = self.setTimeout(() => {
          this.update(0);
        }, DURATION);

        this.svg.classList.remove(`${PROGRESS}-show`);
      }, DURATION);
    }
  }
}
