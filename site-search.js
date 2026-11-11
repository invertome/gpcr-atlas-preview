export const BUCKETS = 256;
export const SPECIES_RESULT_LIMIT = 10;

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const nonempty = value => typeof value === 'string' && value.length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const speciesCache = new Map();
const bucketCache = new WeakMap();

export function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function bucketOf(id) {
  return (fnv1a32(id.toLowerCase()) & 0xff).toString(16).padStart(2, '0');
}

export function normalizeName(text) {
  return text.toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
}

export function classifyQuery(query) {
  const t = query.trim();
  return !t ? 'empty' : t.includes('|') ? 'atlas_id' : /\s/.test(t) ? 'species' : 'gene_or_species';
}

export function rankSpecies(entries, query) {
  const q = normalizeName(query);
  if (q.length < 2) return [];
  const ranked = [];
  for (const entry of entries) {
    let tier = Infinity;
    for (const value of [entry.display_name, entry.ncbi_name, entry.synonym, entry.sample]) {
      if (value === null || value === undefined) continue;
      const f = normalizeName(value);
      const t = f === q ? 0 : f.startsWith(q) ? 1 : f.split(' ').some(w => w.startsWith(q)) ? 2 : f.includes(q) ? 3 : Infinity;
      tier = Math.min(tier, t);
    }
    if (tier !== Infinity) ranked.push({ entry, tier });
  }
  return ranked.sort((a, b) => a.tier - b.tier || compare(a.entry.display_name, b.entry.display_name) ||
    compare(a.entry.sample, b.entry.sample)).map(r => r.entry);
}

async function getJSON(url, fetchJSON) {
  try { return await fetchJSON(url); }
  catch (error) { throw new Error(`Search index unavailable: ${error.message}`); }
}

function bucketEntries(file, hex, url) {
  if (object(file) && bucketCache.has(file)) {
    const cached = bucketCache.get(file);
    if (cached.hex === hex) return cached.entries;
  }
  if (!object(file) || file.version !== 1 || file.bucket !== hex || !Array.isArray(file.entries) ||
      !file.entries.every(e => Array.isArray(e) && e.length === 2 && nonempty(e[0]) && Array.isArray(e[1]) &&
        e[1].every(p => Array.isArray(p) && p.length === 2 && p.every(nonempty)))) {
    throw new Error(`Search index unavailable: ${url} is not a version 1 search file for bucket ${hex}`);
  }
  const entries = new Map();
  for (const [id, pairs] of file.entries) {
    const lower = id.toLowerCase();
    if (!entries.has(lower)) entries.set(lower, []);
    for (const [atlas_id, sample] of pairs) entries.get(lower).push({ id, atlas_id, sample });
  }
  bucketCache.set(file, { hex, entries });
  return entries;
}

export async function lookupGenes(query, { fetchJSON, root }) {
  const t = query.trim();
  const kind = classifyQuery(t);
  const id = kind === 'atlas_id' ? t.slice(t.indexOf('|') + 1) : t;
  if (!id || !(kind === 'atlas_id' || (kind === 'gene_or_species' && t.length >= 2))) return [];
  const hex = bucketOf(id);
  const url = new URL(`search/genes/${hex}.json`, root).href;
  const entries = bucketEntries(await getJSON(url, fetchJSON), hex, url);
  const candidates = entries.get(id.toLowerCase()) || [];
  let hits;
  if (kind === 'atlas_id') {
    hits = candidates.filter(p => p.atlas_id === t);
    if (!hits.length) hits = candidates.filter(p => p.atlas_id.toLowerCase() === t.toLowerCase());
    hits.sort((a, b) => compare(a.atlas_id, b.atlas_id));
  } else {
    hits = [...candidates].sort((a, b) => Number(a.id !== t) - Number(b.id !== t) || compare(a.atlas_id, b.atlas_id));
  }
  return hits.map(({ atlas_id, sample }) => ({ atlas_id, sample }));
}

async function speciesFor(root, fetchJSON) {
  const url = new URL('search/species.json', root).href;
  if (!speciesCache.has(url)) {
    const pending = getJSON(url, fetchJSON).then(file => {
      if (!object(file) || file.version !== 1 || !Array.isArray(file.species) ||
          !file.species.every(e => object(e) && ['sample', 'display_name', 'ncbi_name'].every(k => nonempty(e[k])) &&
            (e.synonym === null || nonempty(e.synonym)))) {
        throw new Error(`Search index unavailable: ${url} is not a version 1 species file`);
      }
      const names = new Map();
      for (const entry of file.species) {
        if (names.has(entry.sample)) throw new Error(`Search index unavailable: duplicate species ${JSON.stringify(entry.sample)}`);
        names.set(entry.sample, entry.display_name);
      }
      return { entries: file.species, names };
    }).catch(error => { speciesCache.delete(url); throw error; });
    speciesCache.set(url, pending);
  }
  return speciesCache.get(url);
}

export async function searchAll(query, { fetchJSON, root }) {
  const kind = classifyQuery(query);
  if (kind === 'empty' || (kind === 'gene_or_species' && query.trim().length < 2)) {
    return { query, species: [], speciesTotal: 0, genes: [] };
  }
  const { entries, names } = await speciesFor(root, fetchJSON);
  const ranked = ['species', 'gene_or_species'].includes(kind) ? rankSpecies(entries, query) : [];
  const genes = await lookupGenes(query, { fetchJSON, root });
  return {
    query,
    species: ranked.slice(0, SPECIES_RESULT_LIMIT).map(({ sample, display_name, synonym }) => ({ sample, display_name, synonym,
      href: new URL(`species/${encodeURIComponent(sample)}/`, root).href })),
    speciesTotal: ranked.length,
    genes: genes.map(({ atlas_id, sample }) => {
      if (!names.has(sample)) throw new Error(`Search index unavailable: gene ${JSON.stringify(atlas_id)} has unknown species ${JSON.stringify(sample)}`);
      return { atlas_id, sample, display_name: names.get(sample), href: new URL(`gene/?id=${encodeURIComponent(atlas_id)}`, root).href };
    }),
  };
}

export function init({ document, fetch, root, navigate, setTimer, clearTimer }) {
  const input = document.getElementById('site-search');
  if (!input) return;
  const results = document.getElementById('site-search-results');
  const status = document.getElementById('site-search-status');
  const form = document.querySelector('[data-site-search]');
  const files = new Map();
  const fetchJSON = async url => {
    if (!files.has(url)) {
      const pending = (async () => {
        const reply = await fetch(url);
        if (!reply.ok) throw new Error(`HTTP ${reply.status} for ${url}`);
        return reply.json();
      })().catch(error => { files.delete(url); throw error; });
      files.set(url, pending);
    }
    return files.get(url);
  };
  let timer = null;
  let generation = 0;
  let active = -1;
  let options = [];
  function activate(index) {
    active = index;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) input.setAttribute('aria-activedescendant', options[index].id);
    else input.removeAttribute('aria-activedescendant');
  }
  function close() {
    generation += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    activate(-1);
  }
  function span(text, className) {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  }
  async function search(query, ticket) {
    try {
      const found = await searchAll(query, { fetchJSON, root });
      if (ticket !== generation) return;
      results.replaceChildren();
      options = [];
      for (const entry of [...found.species, ...found.genes]) {
        const option = document.createElement('a');
        option.setAttribute('role', 'option');
        option.setAttribute('id', `site-search-opt-${options.length}`);
        option.setAttribute('href', entry.href);
        option.setAttribute('aria-selected', 'false');
        if ('atlas_id' in entry) {
          option.append(span(entry.atlas_id, 'identifier'), span(entry.display_name, 'search-species'));
        } else {
          option.append(span(entry.display_name, 'search-species'));
          if (entry.synonym !== null) option.append(span(entry.synonym, 'search-synonym'));
          option.append(span(entry.sample, 'identifier'));
        }
        option.addEventListener('mouseenter', () => activate(options.indexOf(option)));
        options.push(option);
        results.append(option);
      }
      activate(-1);
      results.hidden = options.length === 0;
      input.setAttribute('aria-expanded', String(!results.hidden));
      status.textContent = options.length ? `${found.speciesTotal} species and ${found.genes.length} genes match`
        : `No species or genes match ${query}`;
    } catch (error) {
      if (ticket !== generation) return;
      results.replaceChildren();
      options = [];
      activate(-1);
      const alert = document.createElement('p');
      alert.className = 'error';
      alert.setAttribute('role', 'alert');
      alert.textContent = error.message;
      results.append(alert);
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      status.textContent = '';
    }
  }
  input.addEventListener('input', () => {
    close();
    const ticket = generation;
    const query = input.value;
    timer = setTimer(() => { timer = null; return search(query, ticket); }, 250);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (['ArrowDown', 'ArrowUp'].includes(event.key) && options.length && !results.hidden) {
      event.preventDefault();
      activate(event.key === 'ArrowDown' ? (active + 1) % options.length : (active <= 0 ? options.length - 1 : active - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!results.hidden && (active >= 0 || options.length === 1)) navigate(options[active >= 0 ? active : 0].href);
    }
  });
  form.addEventListener('submit', event => event.preventDefault());
  return { close };
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  init({ document, fetch: url => fetch(url), root: new URL('./', import.meta.url),
    navigate: href => location.assign(href), setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: id => clearTimeout(id) });
}
