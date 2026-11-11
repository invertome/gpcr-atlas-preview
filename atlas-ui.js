const json = value => JSON.stringify(value);
const numericCell = /^-?\d+(\.\d+)?$/;
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function columnType(type) {
  if (type !== 'text' && type !== 'number') throw new Error(`Unknown column type: ${json(type)}`);
}

export function parseSortValue(type, text, sortValue) {
  columnType(type);
  if (type === 'number') {
    if (typeof sortValue === 'string' && numericCell.test(sortValue)) return Number(sortValue);
    if (text.trim() === 'not available') return null;
    throw new Error(`Invalid number cell: ${json(text)}`);
  }
  const value = text.trim();
  return value === '' || value === 'not available' ? null : value;
}

export function nextDirection(type, current) {
  columnType(type);
  return current === null ? (type === 'number' ? 'descending' : 'ascending')
    : current === 'ascending' ? 'descending' : 'ascending';
}

export function sortIndices(values, type, direction) {
  columnType(type);
  const sign = direction === 'ascending' ? 1 : -1;
  return values.map((_, index) => index).sort((a, b) => {
    if (values[a] === null) return values[b] === null ? a - b : 1;
    if (values[b] === null) return -1;
    const order = type === 'number' ? values[a] - values[b] : collator.compare(values[a], values[b]);
    return order * sign || a - b;
  });
}

export function filterIndices(texts, query) {
  const needle = query.trim().toLowerCase();
  return texts.flatMap((text, index) => text.toLowerCase().includes(needle) ? [index] : []);
}

export function countText(shown, total) {
  const noun = total === 1 ? 'row' : 'rows';
  return shown === total ? `Showing all ${total.toLocaleString('en-US')} ${noun}`
    : `Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} ${noun}`;
}

export function toTSV(header, rows) {
  return [header, ...rows].map(row => row.map(cell => String(cell).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n') + '\n';
}

export const CART_KINDS = ['species', 'gene', 'selection', 'bundle'];
const nonempty = value => typeof value === 'string' && value.trim() !== '';

export function validateCartItem(item) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new Error('Cart item must be an object');
  if (!nonempty(item.id)) throw new Error('Cart item id must be a non-empty string');
  if (!CART_KINDS.includes(item.kind)) throw new Error(`Unknown cart item kind: ${json(item.kind)}`);
  if (!nonempty(item.label)) throw new Error('Cart item label must be a non-empty string');
  if (!Number.isInteger(item.count) || item.count <= 0) throw new Error(`Cart item count must be a positive integer: ${json(item.count)}`);
  if (!Array.isArray(item.files) || item.files.some(file => file === null || typeof file !== 'object' ||
      !nonempty(file.label) || !nonempty(file.href))) throw new Error('Cart item files must be a list of {label, href}');
  for (const file of item.files) {
    const href = file.href.trim().replace(/[\u0000-\u0020]/g, '').replace(/\\/g, '/');
    if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) throw new Error(`Cart file link must stay on this site: ${file.href}`);
  }
}

const copyItem = item => ({ ...item, files: item.files.map(file => ({ ...file })) });

export function createCart(storage) {
  let persistent = false;
  let error = null;
  let entries = [];
  let removed = null;
  const storageFailed = failure => {
    console.error(`Cart storage failed: ${failure.message}`);
    persistent = false;
  };
  if (storage !== null) {
    try {
      storage.setItem('atlas-cart-probe', '1');
      if (storage.getItem('atlas-cart-probe') !== '1') throw new Error('Storage probe did not round-trip');
      storage.removeItem('atlas-cart-probe');
      persistent = true;
    } catch (failure) { storageFailed(failure); }
  }
  if (persistent) {
    let raw = null;
    try { raw = storage.getItem('atlas-cart-v1'); }
    catch (failure) { storageFailed(failure); }
    if (raw !== null) {
      try {
        const stored = JSON.parse(raw);
        if (stored === null || typeof stored !== 'object' || stored.version !== 1 || !Array.isArray(stored.items)) {
          throw new Error('Expected version 1 and an items list');
        }
        const ids = new Set();
        for (const item of stored.items) {
          validateCartItem(item);
          if (ids.has(item.id)) throw new Error(`Duplicate cart item id: ${item.id}`);
          ids.add(item.id);
        }
        entries = stored.items.map(copyItem);
      } catch (failure) {
        error = failure.message;
        console.error(`Discarded invalid stored cart: ${error}`);
      }
    }
  }
  const save = () => {
    if (persistent) {
      try { storage.setItem('atlas-cart-v1', JSON.stringify({ version: 1, items: entries })); }
      catch (failure) { storageFailed(failure); }
    }
  };
  return {
    get persistent() { return persistent; },
    get error() { return error; },
    items: () => entries.map(copyItem),
    has: id => entries.some(item => item.id === id),
    add(item) {
      validateCartItem(item);
      if (entries.some(entry => entry.id === item.id)) return false;
      entries.push(copyItem(item));
      removed = null;
      save();
      return true;
    },
    remove(id) {
      const index = entries.findIndex(item => item.id === id);
      if (index === -1) throw new Error(`Cart item not found: ${id}`);
      const [item] = entries.splice(index, 1);
      removed = { item, index };
      save();
      return copyItem(item);
    },
    undo() {
      if (removed === null) return null;
      const { item, index } = removed;
      entries.splice(index, 0, item);
      removed = null;
      save();
      return copyItem(item);
    },
    totals: () => ({ items: entries.length, sequences: entries.reduce((sum, item) => sum + item.count, 0) }),
  };
}

export function readTheme(storage) {
  if (storage === null) return 'dark';
  let theme;
  try { theme = storage.getItem('atlas-theme'); }
  catch { return 'dark'; }
  if (theme === 'light' || theme === 'dark') return theme;
  if (theme !== null) console.error(`Ignored invalid stored theme: ${json(theme)}`);
  return 'dark';
}

export function writeTheme(storage, theme) {
  if (theme !== 'light' && theme !== 'dark') throw new Error(`Invalid theme: ${json(theme)}`);
  if (storage === null) return false;
  try { storage.setItem('atlas-theme', theme); return true; }
  catch { return false; }
}

export function placeTooltip(anchor, tip, viewport) {
  const centered = Math.round(anchor.left + anchor.width / 2 - tip.width / 2);
  const left = Math.max(8, Math.min(centered, viewport.width - tip.width - 8));
  const above = Math.round(anchor.top - tip.height - 8);
  return { left, top: above < 8 ? Math.round(anchor.top + anchor.height + 8) : above };
}

export const FLIP_ROW_LIMIT = 300;

export function flipOffsets(before, after) {
  const offsets = new Map();
  for (const [key, top] of after) {
    if (before.has(key) && before.get(key) !== top) offsets.set(key, before.get(key) - top);
  }
  return offsets;
}

export function init(doc, env) {
  const win = env.window;
  const all = (selector, root = doc) => [...root.querySelectorAll(selector)];
  const one = (selector, root = doc) => root.querySelector(selector);
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safe = (name, fn) => (...args) => {
    try { return fn(...args); }
    catch (failure) { console.error(`Could not enhance ${name}: ${failure.message}`); }
  };
  const on = (element, event, name, fn) => element.addEventListener(event, safe(name, fn));
  const duration = token => {
    const text = win.getComputedStyle(doc.documentElement).getPropertyValue(token).trim();
    return parseFloat(text) * (text.endsWith('ms') ? 1 : 1000);
  };
  const animate = (element, frames, token, easing = '--ease-out') => {
    if (reduced() || typeof element.animate !== 'function') return null;
    return element.animate(frames, { duration: duration(token),
      easing: win.getComputedStyle(doc.documentElement).getPropertyValue(easing).trim() });
  };
  const create = (tag, text, className) => {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  safe('theme', () => {
    const theme = readTheme(env.storage);
    const button = one('[data-theme-toggle]');
    doc.documentElement.dataset.theme = theme;
    button.setAttribute('aria-pressed', String(theme === 'light'));
    on(button, 'click', 'theme', () => {
      const next = doc.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      doc.documentElement.dataset.theme = next;
      button.setAttribute('aria-pressed', String(next === 'light'));
      writeTheme(env.storage, next);
    });
  })();

  safe('menu', () => {
    const button = one('[data-menu-toggle]');
    const nav = one('#site-nav');
    on(button, 'click', 'menu', () => {
      const open = !nav.hasAttribute('data-open');
      nav.toggleAttribute('data-open', open);
      button.setAttribute('aria-expanded', String(open));
    });
    button.hidden = false;
  })();

  for (const wrapper of all('[data-table]')) safe('table', () => {
    const table = one('table', wrapper);
    const headers = all('th[scope="col"]', table);
    const rows = all('tbody tr', table);
    const headerText = headers.map(header => header.textContent.trim());
    const types = headers.map(header => header.dataset.type);
    const values = types.map((type, column) => rows.map(row => {
      const cell = row.cells[column];
      return parseSortValue(type, cell.textContent, cell.getAttribute('data-sort-value'));
    }));
    const texts = rows.map(row => row.textContent);
    const count = one('[data-table-count]', wrapper);
    let activeColumn = null;
    let direction = null;
    const visible = () => rows.filter(row => !row.hidden);
    const updateCount = () => { count.textContent = countText(visible().length, rows.length); };
    headers.forEach((header, column) => {
      const button = create('button', headerText[column], 'sort-button');
      button.type = 'button';
      header.replaceChildren(button);
      header.setAttribute('aria-sort', 'none');
      on(button, 'click', 'table sort', () => {
        const shown = visible();
        const motion = shown.length <= FLIP_ROW_LIMIT && !reduced();
        const before = motion ? new Map(shown.map(row => [row, row.getBoundingClientRect().top])) : new Map();
        direction = nextDirection(types[column], activeColumn === column ? direction : null);
        activeColumn = column;
        const order = sortIndices(values[column], types[column], direction);
        const bodies = new Map();
        for (const index of order) {
          const row = rows[index];
          const body = row.parentNode;
          if (!bodies.has(body)) bodies.set(body, doc.createDocumentFragment());
          bodies.get(body).append(row);
        }
        for (const [body, fragment] of bodies) body.append(fragment);
        headers.forEach((other, index) => other.setAttribute('aria-sort', index === column ? direction : 'none'));
        if (motion) {
          const after = new Map(shown.map(row => [row, row.getBoundingClientRect().top]));
          for (const [row, offset] of flipOffsets(before, after)) {
            animate(row, [{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], '--dur-med');
          }
        }
      });
    });
    // A page-level filter marks rows with data-excluded and dispatches atlas:refilter on the wrapper;
    // a row shows only when neither that filter nor the table's own filter removes it.
    let keep = null;
    const applyFilters = () => {
      rows.forEach((row, index) => { row.hidden = row.hasAttribute('data-excluded') || (keep !== null && !keep.has(index)); });
      updateCount();
    };
    on(one('[data-table-filter]', wrapper), 'input', 'table filter', event => {
      keep = new Set(filterIndices(texts, event.target.value));
      applyFilters();
    });
    on(wrapper, 'atlas:refilter', 'table filter', applyFilters);
    const copy = one('[data-table-copy]', wrapper);
    let copyTimer;
    on(copy, 'click', 'table copy', () => {
      win.clearTimeout(copyTimer);
      const body = all('tbody tr', table).filter(row => !row.hidden).map(row => [...row.cells].map(cell => cell.textContent.trim()));
      const clipboard = win.navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        copy.textContent = 'Copy failed';
        return;
      }
      Promise.resolve(clipboard.writeText(toTSV(headerText, body))).then(() => {
        copy.textContent = 'Copied';
        copyTimer = win.setTimeout(() => { copy.textContent = 'Copy as TSV'; }, 1600);
      }, () => { copy.textContent = 'Copy failed'; });
    });
    one('[data-table-controls]', wrapper).hidden = false;
    applyFilters();
  })();

  for (const figure of all('[data-chart-toggle]')) safe('chart views', () => {
    const views = all('[data-view]', figure);
    const buttons = all('[data-view-button]', figure);
    const table = views.find(view => view.dataset.view === 'table');
    table.hidden = true;
    one('[data-view-switch]', figure).hidden = false;
    buttons.forEach(button => on(button, 'click', 'chart views', () => {
      if (button.getAttribute('aria-pressed') === 'true') return;
      const before = figure.getBoundingClientRect().top;
      const next = button.dataset.viewButton;
      views.forEach(view => { view.hidden = view.dataset.view !== next; });
      buttons.forEach(control => control.setAttribute('aria-pressed', String(control === button)));
      win.scrollBy(0, figure.getBoundingClientRect().top - before);
      const shown = views.find(view => !view.hidden);
      animate(shown, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], '--dur-short');
      if (next === 'chart') for (const bar of all('.rb-bar', shown)) {
        animate(bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], '--dur-chart');
      }
    }));
  })();

  safe('tooltip', () => {
    const tip = one('#chart-tip');
    let anchor = null;
    let described = null;
    const hide = () => {
      tip.hidden = true;
      if (anchor) {
        if (described === null) anchor.removeAttribute('aria-describedby');
        else anchor.setAttribute('aria-describedby', described);
      }
      anchor = null;
    };
    const place = () => {
      const position = placeTooltip(anchor.getBoundingClientRect(), tip.getBoundingClientRect(), { width: win.innerWidth, height: win.innerHeight });
      tip.style.left = `${position.left}px`;
      tip.style.top = `${position.top}px`;
    };
    const show = target => {
      hide();
      anchor = target;
      described = anchor.getAttribute('aria-describedby');
      anchor.setAttribute('aria-describedby', [described, 'chart-tip'].filter(Boolean).join(' '));
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      place();
    };
    for (const eventName of ['pointerover', 'focusin']) on(doc, eventName, 'tooltip', event => {
      const target = event.target.closest?.('[data-tip]');
      if (target) show(target);
    });
    for (const eventName of ['pointerout', 'focusout']) on(doc, eventName, 'tooltip', event => {
      if (event.target.closest?.('[data-tip]') && !anchor?.contains(event.relatedTarget)) hide();
    });
    on(doc, 'keydown', 'tooltip', event => { if (event.key === 'Escape') hide(); });
    // Focusing a mark off screen scrolls it into view; a focused mark keeps its tooltip while it stays on screen.
    on(win, 'scroll', 'tooltip', () => {
      const box = anchor?.getBoundingClientRect();
      if (anchor?.contains(doc.activeElement) && box.bottom > 0 && box.top < win.innerHeight) place();
      else hide();
    });
    on(win, 'resize', 'tooltip', hide);
  })();

  safe('cart', () => {
    const cart = createCart(env.storage);
    const drawer = one('#cart-drawer');
    const opener = one('[data-cart-open]');
    const list = one('[data-cart-items]', drawer);
    const undo = one('[data-cart-undo]', drawer);
    const undoButton = one('[data-cart-undo-button]', drawer);
    const additions = all('[data-cart-add]');
    const originalLabels = new Map(additions.map(button => [button, button.textContent]));
    let open = false;
    let slide = null;
    let previousCount = cart.totals().items;
    const render = (removedLabel = null) => {
      const totals = cart.totals();
      for (const count of all('.cart-count[data-cart-count]')) {
        count.textContent = totals.items.toLocaleString('en-US');
        if (totals.items > previousCount) animate(count, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], '--dur-med');
      }
      previousCount = totals.items;
      one('[data-cart-summary]', drawer).textContent = totals.items === 0 ? 'The cart is empty.'
        : `${totals.items.toLocaleString('en-US')} ${totals.items === 1 ? 'item' : 'items'}, ${totals.sequences.toLocaleString('en-US')} ${totals.sequences === 1 ? 'sequence' : 'sequences'}.`;
      one('[data-cart-storage-note]', drawer).hidden = cart.persistent;
      list.replaceChildren();
      for (const item of cart.items()) {
        const row = create('li');
        row.setAttribute('data-cart-item', item.id);
        row.append(create('span', item.label, 'cart-item-label'));
        row.append(create('span', `${item.count.toLocaleString('en-US')} ${item.count === 1 ? 'sequence' : 'sequences'}`, 'number'));
        for (const file of item.files) {
          const link = create('a', file.label);
          link.setAttribute('href', file.href);
          link.setAttribute('download', '');
          row.append(link);
        }
        const remove = create('button', 'Remove');
        remove.type = 'button';
        on(remove, 'click', 'cart removal', () => {
          const removed = cart.remove(item.id);
          render(removed.label);
          undoButton.focus();
        });
        row.append(remove);
        list.append(row);
      }
      undo.hidden = removedLabel === null;
      undoButton.textContent = removedLabel === null ? '' : `Undo removal of ${removedLabel}`;
      undoButton.title = undoButton.textContent;
      for (const button of additions) {
        const present = cart.has(button.dataset.cartId);
        button.textContent = present ? 'In the cart' : originalLabels.get(button);
        if (present) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      }
    };
    const close = () => {
      if (!open) return;
      open = false;
      slide?.cancel();
      opener.setAttribute('aria-expanded', 'false');
      opener.focus();
      slide = animate(drawer, [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], '--dur-med');
      if (slide) slide.onfinish = () => { if (!open) drawer.hidden = true; };
      else drawer.hidden = true;
    };
    const show = () => {
      slide?.cancel();
      open = true;
      drawer.hidden = false;
      opener.setAttribute('aria-expanded', 'true');
      slide = animate(drawer, [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], '--dur-med');
      one('#cart-title', drawer).focus();
    };
    on(opener, 'click', 'cart drawer', () => { if (open) close(); else show(); });
    on(one('[data-cart-close]', drawer), 'click', 'cart drawer', close);
    on(doc, 'keydown', 'cart drawer', event => { if (event.key === 'Escape') close(); });
    on(undoButton, 'click', 'cart undo', () => { cart.undo(); render(); one('#cart-title', drawer).focus(); });
    for (const button of additions) on(button, 'click', 'cart addition', () => {
      const data = button.dataset;
      try {
        cart.add({ id: data.cartId, kind: data.cartKind, label: data.cartLabel, count: Number(data.cartCount),
          files: [{ label: 'FASTA', href: data.cartFasta }, { label: 'Records', href: data.cartRecords }] });
      } catch (failure) {
        one('[data-cart-summary]', drawer).textContent = 'Could not add this item.';
        show();
        throw failure;
      }
      render();
    });
    render();
  })();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  let storage = null;
  try { storage = window.localStorage; }
  catch (failure) { console.error(`Cart storage failed: ${failure.message}`); }
  init(document, { window, storage });
}
