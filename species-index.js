// Species index: one filter row drives the cards, the table and the matrix; the view and filters live in the URL.
// Without this script every view renders in full and the filter row stays hidden.
export const NO_ORDER = '-';
export const VIEWS = ['cards', 'table', 'matrix'];
const SELECTS = { class: 'sf-class', order: 'sf-order', clade: 'sf-clade', source: 'sf-source', ligand: 'sf-ligand' };
const NUMBERS = { busco_min: 'sf-busco-min', busco_max: 'sf-busco-max', min: 'sf-min' };

export function parseNumber(text) {
  const value = String(text ?? '').trim();
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function readItem(dataset) {
  const busco = Number(dataset.busco);
  const n = Number(dataset.n);
  if (!Number.isFinite(busco) || !Number.isSafeInteger(n)) throw new Error(`Invalid species card data for ${dataset.sample}`);
  return { sample: dataset.sample, search: dataset.search, cls: dataset.cls, order: dataset.order, clade: dataset.clade,
    origin: dataset.origin, busco, n, ligands: dataset.lig ? dataset.lig.split(' ') : [] };
}

// values: raw field values by URL key. Invalid numbers are reported and ignored, never guessed.
export function filtersFrom(values) {
  const invalid = [];
  const number = key => {
    const parsed = parseNumber(values[key]);
    if (Number.isNaN(parsed)) { invalid.push(key); return null; }
    return parsed;
  };
  const filters = { q: String(values.q ?? '').trim().toLowerCase() };
  for (const key of Object.keys(SELECTS)) filters[key] = String(values[key] ?? '');
  filters.buscoMin = number('busco_min');
  filters.buscoMax = number('busco_max');
  filters.min = number('min');
  return { filters, invalid };
}

export function matches(item, f) {
  return (f.q === '' || item.search.includes(f.q))
    && (f.class === '' || item.cls === f.class)
    && (f.order === '' || item.order === f.order)
    && (f.clade === '' || item.clade === f.clade)
    && (f.source === '' || item.origin === f.source)
    && (f.ligand === '' || item.ligands.includes(f.ligand))
    && (f.buscoMin === null || item.busco >= f.buscoMin)
    && (f.buscoMax === null || item.busco <= f.buscoMax)
    && (f.min === null || item.n >= f.min);
}

export function active(f) {
  return f.q !== '' || Object.keys(SELECTS).some(key => f[key] !== '') || f.buscoMin !== null || f.buscoMax !== null || f.min !== null;
}

export function countText(shown, total) {
  return shown === total ? `Showing all ${total.toLocaleString('en-US')} species`
    : `Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} species`;
}

// Card order as indices into the server order, which is by name.
export function cardOrder(items, key) {
  const index = items.map((_, i) => i);
  if (key === 'name') return index;
  if (key === 'count') return index.sort((a, b) => items[b].n - items[a].n || a - b);
  if (key === 'busco') return index.sort((a, b) => items[b].busco - items[a].busco || a - b);
  throw new Error(`Unknown card sort: ${JSON.stringify(key)}`);
}

export function queryString(values, view) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (String(value).trim() !== '') params.set(key, String(value).trim());
  if (view !== 'cards') params.set('view', view);
  return params.toString();
}

export function init(doc, win) {
  const form = doc.querySelector('[data-species-filters]');
  if (!form) return;
  const byId = id => doc.getElementById(id);
  const cards = [...doc.querySelectorAll('.sp-card')];
  const list = doc.querySelector('.species-cards');
  const items = cards.map(card => readItem(card.dataset));
  const tableWrapper = byId('species-table');
  const tableRows = new Map([...tableWrapper.querySelectorAll('tbody tr[data-sample]')].map(row => [row.dataset.sample, row]));
  const matrix = doc.querySelector('table.heatmap');
  const matrixRows = new Map([...(matrix ? matrix.querySelectorAll('tr[data-sample]') : [])].map(row => [row.dataset.sample, row]));
  const count = doc.querySelector('[data-species-count]');
  const note = doc.querySelector('[data-matrix-note]');
  const viewButtons = [...doc.querySelectorAll('[data-species-view]')];
  const panels = [...doc.querySelectorAll('[data-species-panel]')];
  const sortField = doc.querySelector('[data-card-sort-field]');
  const sort = doc.querySelector('[data-card-sort]');
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = token => {
    const text = win.getComputedStyle(doc.documentElement).getPropertyValue(token).trim();
    return (parseFloat(text) || 0) * (text.endsWith('ms') ? 1 : 1000);
  };
  const animate = (element, frames) => {
    if (reduced() || typeof element.animate !== 'function') return;
    element.animate(frames, { duration: duration('--dur-med'),
      easing: win.getComputedStyle(doc.documentElement).getPropertyValue('--ease-out').trim() || 'ease-out' });
  };
  let view = 'cards';

  const fieldValues = () => {
    const values = { q: byId('sf-name').value };
    for (const [key, id] of Object.entries({ ...SELECTS, ...NUMBERS })) values[key] = byId(id).value;
    return values;
  };
  const writeURL = () => {
    const query = queryString(fieldValues(), view);
    win.history.replaceState(null, '', `${win.location.pathname}${query ? `?${query}` : ''}${win.location.hash}`);
  };
  const markMatrixGroups = () => {
    if (!matrix) return;
    for (const body of matrix.querySelectorAll('tbody')) {
      let order = null;
      let orderShown = false;
      let groupShown = false;
      const close = () => { if (order) order.toggleAttribute('data-excluded', !orderShown); };
      for (const row of body.querySelectorAll('tr')) {
        if (row.classList.contains('heatmap-order')) { close(); order = row; orderShown = false; }
        else if (row.hasAttribute('data-sample') && !row.hasAttribute('data-excluded')) { orderShown = true; groupShown = true; }
      }
      close();
      body.querySelector('tr.heatmap-group')?.toggleAttribute('data-excluded', !groupShown);
    }
  };
  const apply = ({ animated = true } = {}) => {
    const { filters, invalid } = filtersFrom(fieldValues());
    for (const [key, id] of Object.entries(NUMBERS)) {
      if (invalid.includes(key)) byId(id).setAttribute('aria-invalid', 'true');
      else byId(id).removeAttribute('aria-invalid');
    }
    let shown = 0;
    items.forEach((item, index) => {
      const keep = matches(item, filters);
      shown += keep ? 1 : 0;
      cards[index].toggleAttribute('data-excluded', !keep);
      tableRows.get(item.sample)?.toggleAttribute('data-excluded', !keep);
      matrixRows.get(item.sample)?.toggleAttribute('data-excluded', !keep);
    });
    markMatrixGroups();
    tableWrapper.dispatchEvent(new win.Event('atlas:refilter'));
    count.textContent = countText(shown, items.length);
    note.hidden = !active(filters);
    if (animated && view === 'cards') animate(list, [{ opacity: 0.35 }, { opacity: 1 }]);
    writeURL();
  };
  const setView = (next, { animated = true } = {}) => {
    if (!VIEWS.includes(next)) throw new Error(`Unknown species view: ${JSON.stringify(next)}`);
    view = next;
    for (const panel of panels) panel.hidden = panel.dataset.speciesPanel !== next;
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.speciesView === next));
    sortField.hidden = next !== 'cards';
    if (animated) animate(panels.find(panel => !panel.hidden), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }]);
    writeURL();
  };
  const sortCards = () => {
    const order = cardOrder(items, sort.value);
    list.append(...order.map(index => cards[index]));
  };

  const params = new URLSearchParams(win.location.search);
  byId('sf-name').value = params.get('q') ?? '';
  for (const [key, id] of Object.entries(SELECTS)) {
    const value = params.get(key);
    if (value === null) continue;
    const select = byId(id);
    if ([...select.options].some(option => option.value === value)) select.value = value;
    else console.error(`Ignored unknown ${key} in the link: ${JSON.stringify(value)}`);
  }
  for (const [key, id] of Object.entries(NUMBERS)) byId(id).value = params.get(key) ?? '';
  const requested = params.get('view') ?? 'cards';
  if (!VIEWS.includes(requested)) console.error(`Ignored unknown view in the link: ${JSON.stringify(requested)}`);

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', () => apply());
  form.addEventListener('reset', () => win.setTimeout(() => apply(), 0));
  for (const button of viewButtons) button.addEventListener('click', () => setView(button.dataset.speciesView));
  sort.addEventListener('change', sortCards);
  form.hidden = false;
  doc.querySelector('[data-species-views]').hidden = false;
  setView(VIEWS.includes(requested) ? requested : 'cards', { animated: false });
  apply({ animated: false });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  try { init(document, window); }
  catch (failure) { console.error(`Could not enhance the species index: ${failure.message}`); }
}
