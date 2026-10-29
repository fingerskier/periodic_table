import { RADIUS, yOfPeriod } from '../layout/cylinder';
import { h } from '../ui/dom';
import type { Stage } from './stage';

/**
 * Period labels pinned to the cylinder's left silhouette. A period is a ring, so its label can
 * sit at the same screen edge whatever the rotation; only the camera pose moves it.
 */
export class RowLabels {
  readonly root: HTMLDivElement;
  readonly labels: HTMLButtonElement[] = [];
  private key = '';

  constructor(private stage: Stage) {
    this.root = h('div', { class: 'row-labels' });
    for (let p = 1; p <= 7; p++) {
      const btn = h('button', { class: 'row-label', type: 'button', 'data-period': p, 'aria-label': `Period ${p}` },
        h('span', { class: 'rl-cap' }, 'Period'), String(p), h('span', { class: 'rl-tick' }));
      this.labels.push(btn);
      this.root.appendChild(btn);
    }
    stage.host.appendChild(this.root);
    stage.onFrame(() => { this.update(); return false; });
    stage.onResize(() => { this.key = ''; });
  }

  private update(): void {
    const v = this.stage.view;
    const key = `${v.azimuth.toFixed(5)}|${v.pitch.toFixed(5)}|${v.zoom.toFixed(5)}|${this.stage.width}x${this.stage.height}`;
    if (key === this.key) return;
    this.key = key;
    const dh = this.stage.horizontalDistance;
    const alpha = Math.acos(Math.min(1, RADIUS / Math.max(dh, RADIUS + 1)));
    const t = v.azimuth - alpha;
    for (let p = 1; p <= 7; p++) {
      const s = this.stage.project(RADIUS * Math.sin(t), yOfPeriod(p), RADIUS * Math.cos(t));
      const btn = this.labels[p - 1]!;
      const x = Math.max(btn.offsetWidth + 6, s.x - 16);
      btn.style.transform = `translate(${x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-100%, -50%)`;
      btn.style.visibility = s.behind || s.y < -20 || s.y > this.stage.height + 20 ? 'hidden' : '';
    }
  }

  applyStates(active: number | null, hl: number | null): void {
    this.labels.forEach((btn, i) => {
      btn.classList.toggle('is-active', i + 1 === active);
      btn.classList.toggle('is-hl', i + 1 === hl && i + 1 !== active);
    });
  }
}
