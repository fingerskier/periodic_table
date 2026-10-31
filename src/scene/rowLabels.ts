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
  private compact = false;

  constructor(private stage: Stage) {
    this.root = h('div', { class: 'row-labels' });
    for (let p = 1; p <= 7; p++) {
      const btn = h('button', { class: 'row-label', type: 'button', 'data-period': p, 'aria-label': `Period ${p}`, 'aria-pressed': 'false', tabindex: p === 1 ? 0 : -1 },
        h('span', { class: 'rl-cap', 'aria-hidden': 'true' }, 'Period'), h('span', { 'aria-hidden': 'true' }, String(p)), h('span', { class: 'rl-tick' }));
      this.labels.push(btn);
      this.root.appendChild(btn);
    }
    stage.host.appendChild(this.root);
    stage.onFrame(() => { this.update(); return false; });
    stage.onResize(() => { this.key = ''; this.updateCompact(); });
    this.updateCompact();
  }

  /**
   * Number-only labels on small stages. Decided by the stage size alone (not by row spacing), so
   * the camera fit, which reserves room for the labels, cannot feed back into it.
   */
  private updateCompact(): void {
    const compact = this.stage.width < 700 || this.stage.height < 560;
    if (compact === this.compact) return;
    this.compact = compact;
    this.root.classList.toggle('is-compact', compact);
  }

  /** The one label that Tab reaches; arrow keys move it. */
  setRoving(period: number): void {
    this.labels.forEach((btn, i) => { btn.tabIndex = i + 1 === period ? 0 : -1; });
  }

  focus(period: number): void {
    this.setRoving(period);
    this.labels[period - 1]?.focus({ preventScroll: true });
  }

  private update(): void {
    const v = this.stage.view;
    const key = `${v.azimuth.toFixed(5)}|${v.pitch.toFixed(5)}|${v.zoom.toFixed(5)}|${this.stage.width}x${this.stage.height}`;
    if (key === this.key) return;
    this.key = key;
    const dh = this.stage.horizontalDistance;
    const alpha = Math.acos(Math.min(1, RADIUS / Math.max(dh, RADIUS + 1)));
    const t = v.azimuth - alpha;
    const pts = Array.from({ length: 7 }, (_, i) => this.stage.project(RADIUS * Math.sin(t), yOfPeriod(i + 1), RADIUS * Math.cos(t)));
    pts.forEach((s, i) => {
      const btn = this.labels[i]!;
      const w = btn.offsetWidth;
      // Off the left edge (zoomed in): park at the edge, translucent, rather than vanish.
      const clamped = s.x - 16 < w + 6;
      const x = clamped ? w + 6 : s.x - 16;
      btn.style.transform = `translate(${x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-100%, -50%)`;
      btn.classList.toggle('is-clamped', clamped);
      btn.style.visibility = s.behind || s.y < -20 || s.y > this.stage.height + 20 ? 'hidden' : '';
    });
  }

  /** Horizontal room the labels need left of the cylinder (for the camera fit). */
  get reserve(): number {
    const widest = Math.max(...this.labels.map((b) => b.offsetWidth));
    return widest + 22;
  }

  applyStates(active: number | null, hl: number | null): void {
    this.labels.forEach((btn, i) => {
      btn.classList.toggle('is-active', i + 1 === active);
      btn.classList.toggle('is-hl', i + 1 === hl && i + 1 !== active);
    });
  }

  applyPinned(period: number | null): void {
    this.labels.forEach((btn, i) => btn.setAttribute('aria-pressed', String(i + 1 === period)));
  }
}
