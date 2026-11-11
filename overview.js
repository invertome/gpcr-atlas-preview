// Overview enhancements: the universe teaser canvas (real map coordinates from ref_points only) and the
// column highlight on the clade heat grid. The page reads fully without this script.
const json = value => JSON.stringify(value);
export const DIM_GROUP = 0.08;
export const DIM_CANDIDATES = 0.15;

export function decodeTeaser(payload) {
  if (payload === null || typeof payload !== 'object') throw new Error('Teaser data must be an object');
  const { levels, groups, tokens, references, candidates } = payload;
  if (!Number.isInteger(levels) || levels < 2) throw new Error(`Invalid teaser levels: ${json(levels)}`);
  if (!Array.isArray(groups) || !Array.isArray(tokens) || tokens.length !== groups.length) {
    throw new Error('Teaser groups and tokens must be lists of equal length');
  }
  if (!Array.isArray(references) || references.length % 3 !== 0) throw new Error('Teaser references must hold x, y, group triples');
  if (!Array.isArray(candidates) || candidates.length % 2 !== 0) throw new Error('Teaser candidates must hold x, y pairs');
  const level = value => Number.isInteger(value) && value >= 0 && value < levels;
  const byGroup = groups.map(() => []);
  for (let i = 0; i < references.length; i += 3) {
    const [x, y, group] = [references[i], references[i + 1], references[i + 2]];
    if (!level(x) || !level(y) || !Number.isInteger(group) || group < 0 || group >= groups.length) {
      throw new Error(`Invalid teaser reference ${i / 3}: ${json([x, y, group])}`);
    }
    byGroup[group].push(x, y);
  }
  for (let i = 0; i < candidates.length; i += 2) {
    if (!level(candidates[i]) || !level(candidates[i + 1])) throw new Error(`Invalid teaser candidate ${i / 2}`);
  }
  return { levels, groups, tokens, byGroup, candidates };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
}

// Label position of each ligand type: the median x and median y of its points.
export function groupCenters(model) {
  return model.byGroup.map(points => {
    if (points.length === 0) return null;
    return [median(points.filter((_, i) => i % 2 === 0)), median(points.filter((_, i) => i % 2 === 1))];
  });
}

// Opacity factor of each layer for a focus: null (all), a group index, or 'candidates'.
export function targetAlphas(model, focus) {
  return { groups: model.groups.map((_, i) => focus === null || focus === i ? 1 : DIM_GROUP),
    candidates: focus === null || focus === 'candidates' ? 1 : DIM_CANDIDATES };
}

export const easeOut = t => 1 - (1 - t) ** 3;

export function initTeaser(root, doc, win) {
  const source = doc.getElementById('universe-data');
  if (!source) return;
  const model = decodeTeaser(JSON.parse(source.textContent));
  const canvas = root.querySelector('[data-teaser-canvas]');
  const buttons = [...root.querySelectorAll('[data-teaser-group]')];
  const centers = groupCenters(model);
  const context = canvas.getContext('2d');
  let colors = null;
  let alphas = targetAlphas(model, null);
  let pinned = null;
  let preview;
  let frame = 0;
  const style = () => win.getComputedStyle(doc.documentElement);
  const readColors = () => {
    const s = style();
    const token = name => s.getPropertyValue(name).trim();
    colors = { groups: model.tokens.map(token), candidate: token('--color-candidate'), paper: token('--color-paper-2'),
      ink: token('--color-ink'), font: token('--font-text') };
  };
  const duration = () => {
    const text = style().getPropertyValue('--dur-med').trim();
    return (parseFloat(text) || 0) * (text.endsWith('ms') ? 1 : 1000);
  };
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const focus = () => preview !== undefined ? preview : pinned;
  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = win.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    context.clearRect(0, 0, w, h);
    const pad = 12 * dpr;
    const side = Math.max(1, Math.min(w, h) - 2 * pad);
    const scale = side / (model.levels - 1);
    const px = x => (w - side) / 2 + x * scale;
    const py = y => (h - side) / 2 + (model.levels - 1 - y) * scale;
    const dots = (points, radius) => {
      context.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        context.moveTo(px(points[i]) + radius, py(points[i + 1]));
        context.arc(px(points[i]), py(points[i + 1]), radius, 0, 2 * Math.PI);
      }
    };
    model.byGroup.forEach((points, group) => {
      context.globalAlpha = 0.7 * alphas.groups[group];
      context.fillStyle = colors.groups[group];
      dots(points, 1.6 * dpr);
      context.fill();
    });
    context.globalAlpha = alphas.candidates;
    dots(model.candidates, 2.6 * dpr);
    context.fillStyle = colors.candidate;
    context.fill();
    context.lineWidth = dpr;
    context.strokeStyle = colors.paper;
    context.stroke();
    const current = focus();
    if (typeof current === 'number' && centers[current]) {
      const [x, y] = centers[current];
      context.globalAlpha = 1;
      context.font = `${13 * dpr}px ${colors.font}`;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.lineWidth = 4 * dpr;
      context.strokeStyle = colors.paper;
      context.strokeText(model.groups[current], px(x), py(y) - 6 * dpr);
      context.fillStyle = colors.ink;
      context.fillText(model.groups[current], px(x), py(y) - 6 * dpr);
    }
    context.globalAlpha = 1;
  };
  const transition = () => {
    const target = targetAlphas(model, focus());
    win.cancelAnimationFrame(frame);
    const total = reduced() ? 0 : duration();
    if (total <= 0) { alphas = target; draw(); return; }
    const from = { groups: [...alphas.groups], candidates: alphas.candidates };
    const start = win.performance.now();
    const step = now => {
      const t = Math.min(1, Math.max(0, (now - start) / total));
      const e = easeOut(t);
      alphas = { groups: from.groups.map((a, i) => a + (target.groups[i] - a) * e),
        candidates: from.candidates + (target.candidates - from.candidates) * e };
      draw();
      if (t < 1) frame = win.requestAnimationFrame(step);
    };
    frame = win.requestAnimationFrame(step);
  };
  const keyOf = button => button.dataset.teaserGroup === 'candidates' ? 'candidates' : Number(button.dataset.teaserGroup);
  for (const button of buttons) {
    const key = keyOf(button);
    const show = () => { preview = key; transition(); };
    const hide = () => { preview = undefined; transition(); };
    button.addEventListener('pointerenter', show);
    button.addEventListener('pointerleave', hide);
    button.addEventListener('focus', show);
    button.addEventListener('blur', hide);
    button.addEventListener('click', () => {
      pinned = pinned === key ? null : key;
      for (const other of buttons) other.setAttribute('aria-pressed', String(keyOf(other) === pinned));
      transition();
    });
  }
  readColors();
  draw();
  if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(() => draw()).observe(canvas);
  if (typeof win.MutationObserver === 'function') {
    new win.MutationObserver(() => { readColors(); draw(); })
      .observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
}

export function initHeatGrid(grid) {
  const cells = [...grid.querySelectorAll('[data-col]')];
  let active = null;
  const set = column => {
    if (column === active) return;
    active = column;
    for (const cell of cells) cell.toggleAttribute('data-col-active', column !== null && cell.dataset.col === column);
  };
  const from = event => event.target.closest?.('[data-col]')?.dataset.col ?? null;
  grid.addEventListener('pointerover', event => set(from(event)));
  grid.addEventListener('focusin', event => set(from(event)));
  grid.addEventListener('pointerleave', () => set(null));
  grid.addEventListener('focusout', event => { if (!grid.contains(event.relatedTarget)) set(null); });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const safe = (name, fn) => {
    try { fn(); } catch (failure) { console.error(`Could not enhance ${name}: ${failure.message}`); }
  };
  for (const root of document.querySelectorAll('[data-teaser]')) safe('universe teaser', () => initTeaser(root, document, window));
  for (const grid of document.querySelectorAll('.heat-grid')) safe('heat grid', () => initHeatGrid(grid));
}
