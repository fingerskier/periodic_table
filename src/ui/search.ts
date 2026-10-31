import './panels.css';
import type { ElementData, UiContext } from '../types';
import { h, replaceChildren } from './dom';
import { CATEGORY_BY_ID } from './palette';
import { ICONS, isTextEntry, svgIcon } from './toolbar';

// Element search: a combobox (WAI-ARIA 1.2 pattern, list autocomplete with automatic selection)
// over a ranked match function that is pure and tested on its own.

// ---------------------------------------------------------------- matching (pure)

export const SEARCH_PLACEHOLDER = 'Find an element — name, symbol or number';

/** Match tiers, best first. Ties keep atomic-number order. */
export const RANK = { symbol: 0, number: 1, namePrefix: 2, symbolPrefix: 3, nameSubstring: 4 } as const;
export type Rank = (typeof RANK)[keyof typeof RANK];

/** Other spellings people type (US/UK, and the name behind the symbol W); matched like names. */
const ALIASES: Readonly<Record<number, readonly string[]>> = {
  13: ['aluminum', 'aluminium'],
  16: ['sulphur', 'sulfur'],
  55: ['cesium', 'caesium'],
  74: ['wolfram'],
};

export interface SearchHit {
  element: ElementData;
  rank: Rank;
  /** The alternative spelling that matched, when the element's own name did not. */
  alias?: string;
}

/**
 * Lower-case, strip diacritics and fold compatibility forms, such as the full-width 'Ｆｅ２６'
 * typed with East Asian input methods. Plain ASCII keeps its length.
 */
function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The form both queries and names are compared in: '  Fé ' → 'fe'. */
export function normalizeQuery(text: string): string {
  return fold(text).trim();
}

function rankOf(e: ElementData, q: string, z: number | null): Omit<SearchHit, 'element'> | null {
  const symbol = e.symbol.toLowerCase();
  if (symbol === q) return { rank: RANK.symbol };
  if (z !== null && e.z === z) return { rank: RANK.number };
  const name = normalizeQuery(e.name);
  const aliases = (ALIASES[e.z] ?? []).filter((a) => a !== name);
  if (name.startsWith(q)) return { rank: RANK.namePrefix };
  const prefixAlias = aliases.find((a) => a.startsWith(q));
  if (prefixAlias) return { rank: RANK.namePrefix, alias: prefixAlias };
  if (symbol.startsWith(q)) return { rank: RANK.symbolPrefix };
  if (name.includes(q)) return { rank: RANK.nameSubstring };
  const innerAlias = aliases.find((a) => a.includes(q));
  return innerAlias ? { rank: RANK.nameSubstring, alias: innerAlias } : null;
}

/** Ranked matches with the tier (and alias) each one matched by. */
export function searchHits(query: string, elements: readonly ElementData[], limit = 8): SearchHit[] {
  const q = normalizeQuery(query);
  if (!q || limit <= 0) return [];
  const z = /^\d+$/.test(q) ? Number(q) : null;
  const hits: SearchHit[] = [];
  for (const element of elements) {
    const r = rankOf(element, q, z);
    if (r) hits.push({ element, ...r });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.element.z - b.element.z).slice(0, limit);
}

/**
 * Elements matching `query`, best first: exact symbol (any case), exact atomic number, name
 * prefix, symbol prefix, then name substring. Diacritics and surrounding whitespace are ignored.
 */
export function searchElements(query: string, elements: readonly ElementData[], limit = 8): ElementData[] {
  return searchHits(query, elements, limit).map((hit) => hit.element);
}

/** `text` split around the first occurrence of an already-normalized `q`, for <mark>ing. */
export function splitMatch(text: string, q: string): [before: string, match: string, after: string] | null {
  if (!q) return null;
  const folded = fold(text);
  const i = folded.indexOf(q);
  // Index mapping is only safe when folding kept the length (true for every element name).
  if (i < 0 || folded.length !== text.length) return null;
  return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}

// ---------------------------------------------------------------- combobox

let mounts = 0;

export function mountSearch(root: HTMLElement, ctx: UiContext): void {
  const n = ++mounts;
  const inputId = `srch-input-${n}`;
  const listId = `srch-list-${n}`;

  const input = h('input', {
    id: inputId,
    class: 'srch-input',
    type: 'search',
    placeholder: SEARCH_PLACEHOLDER,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listId,
    'aria-keyshortcuts': '/',
  });
  const list = h('ul', { id: listId, class: 'srch-list', role: 'listbox', 'aria-label': 'Matching elements' });
  const empty = h('p', { class: 'srch-empty', 'aria-hidden': 'true' });
  const pop = h('div', { class: 'srch-pop', hidden: true }, list, empty);
  const status = h('p', { class: 'pn-sr', role: 'status' });
  replaceChildren(
    root,
    h(
      'div',
      { class: 'srch' },
      h('label', { class: 'pn-sr', for: inputId }, 'Find an element'),
      h('div', { class: 'srch-field' }, svgIcon(ICONS.search, 16), input, h('kbd', { class: 'pn-kbd srch-kbd', 'aria-hidden': 'true' }, '/')),
      pop,
      status,
    ),
  );

  let hits: SearchHit[] = [];
  let active = -1;
  let open = false;
  let announceTimer = 0;

  const query = () => normalizeQuery(input.value);
  const elements = () => ctx.model().elements;

  function optionFor(hit: SearchHit, i: number): HTMLLIElement {
    const e = hit.element;
    const cat = CATEGORY_BY_ID.get(e.category);
    const parts = splitMatch(e.name, query());
    const name = parts ? [parts[0], h('mark', null, parts[1]), parts[2]] : [e.name];
    const li = h(
      'li',
      {
        id: `${listId}-z${e.z}`,
        class: 'srch-opt',
        role: 'option',
        'aria-selected': 'false',
        'aria-label': `${e.name}, ${e.symbol}, atomic number ${e.z}${hit.alias ? `, also called ${hit.alias}` : ''}`,
        'data-index': i,
      },
      h('span', { class: 'srch-z' }, e.z),
      h('span', { class: 'srch-sym' }, e.symbol),
      h('span', { class: 'srch-name' }, name, hit.alias ? h('span', { class: 'srch-alias' }, hit.alias) : null),
      cat ? h('span', { class: 'srch-cat' }, cat.label) : null,
    );
    if (cat) li.style.setProperty('--cat', cat.color);
    return li;
  }

  function markActive(): void {
    const options = [...list.children] as HTMLElement[];
    options.forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === active));
      li.classList.toggle('is-active', i === active);
    });
    const current = open ? options[active] : undefined;
    if (current) input.setAttribute('aria-activedescendant', current.id);
    else input.removeAttribute('aria-activedescendant');
  }

  function render(): void {
    replaceChildren(list, hits.map(optionFor));
    const showList = open && hits.length > 0;
    list.hidden = !showList;
    empty.hidden = !open || hits.length > 0;
    empty.textContent = open && !hits.length ? `No element matches “${input.value.trim()}”` : '';
    pop.hidden = !open;
    input.setAttribute('aria-expanded', String(showList));
    markActive();
    if (!open) {
      // A count left in the live region would be stale, and the same count later not re-read.
      window.clearTimeout(announceTimer);
      status.textContent = '';
    }
  }

  function announce(): void {
    window.clearTimeout(announceTimer);
    // Wait for a pause in typing so screen readers are not flooded.
    announceTimer = window.setTimeout(() => {
      const count = hits.length;
      status.textContent = !query() || !open ? '' : count ? `${count} ${count === 1 ? 'match' : 'matches'}` : 'No matching element';
    }, 400);
  }

  function refresh(): void {
    hits = searchHits(input.value, elements());
    active = hits.length ? 0 : -1;
    open = query() !== '';
    render();
    announce();
  }

  function close(): void {
    if (!open) return;
    open = false;
    render();
  }

  function choose(hit: SearchHit): void {
    input.value = hit.element.name;
    hits = [hit];
    active = 0;
    open = false;
    render();
    ctx.focusElement(hit.element.z);
    // On touch screens, put the on-screen keyboard away so the cylinder can be seen turning.
    if (window.matchMedia?.('(pointer: coarse)').matches) input.blur();
  }

  function step(delta: 1 | -1): void {
    if (!open) {
      refresh();
      if (delta < 0 && hits.length) active = hits.length - 1;
      markActive();
      return;
    }
    if (!hits.length) return;
    active = (active + delta + hits.length) % hits.length;
    markActive();
  }

  input.addEventListener('input', refresh);
  input.addEventListener('focus', () => {
    if (query()) refresh();
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (ev) => {
    if (ev.isComposing) return;
    switch (ev.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        ev.preventDefault();
        step(ev.key === 'ArrowDown' ? 1 : -1);
        return;
      case 'Enter': {
        const hit = open && active >= 0 ? hits[active] : searchHits(input.value, elements(), 1)[0];
        if (!hit) return;
        ev.preventDefault();
        choose(hit);
        return;
      }
      case 'Escape':
        // First close the list, then clear the text, then hand the keyboard back to the page.
        ev.preventDefault();
        if (open) close();
        else if (input.value) {
          input.value = '';
          hits = [];
          active = -1;
          render();
        } else input.blur();
        return;
    }
  });

  // Keep focus in the input while the pointer is on the list, so blur does not close it first.
  pop.addEventListener('mousedown', (ev) => ev.preventDefault());
  list.addEventListener('click', (ev) => {
    const li = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-index]') : null;
    const hit = li ? hits[Number(li.dataset.index)] : undefined;
    if (hit) choose(hit);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/' || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || isTextEntry(ev.target)) return;
    ev.preventDefault();
    input.focus();
    input.select();
  });
}
