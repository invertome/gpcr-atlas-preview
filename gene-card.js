export const CARD_GROUPS = [
  { key: 'identity', title: 'Identity', columns: ['atlas_id', 'original_id', 'gene_id', 'length'] },
  { key: 'gate', title: 'Gate evidence', columns: [
    'pf00001_E_Z43318', 'pf00001_E_ownZ', 'pass_pf00001', 'pass_pf00001_ownZ',
    'ps50262_nscore', 'pass_ps50262', 'sr_ga_families', 'pass_sr', 'cdd_top7tm',
    'cdd_top7tm_E', 'pass_cdd', 'class_a_excluded', 'n_tm', 'pass_tm', 'gate_verdict', 'gate_reason',
  ] },
  { key: 'calls', title: 'Calls', columns: [
    'call_state', 'family_call', 'agreement_level', 'call_basis', 'subtype_call',
    'subtype_agreement_level', 'subtype_call_basis', 'rep_tie',
  ] },
  { key: 'novelty', title: 'Novelty threshold', columns: [
    'novelty_family_call', 'family_distance', 'family_above', 'novelty_subtype_call',
    'subtype_distance', 'subtype_above', 'nearest_family', 'nearest_subtype',
  ] },
  { key: 'embedding', title: 'Embedding and pocket', columns: [
    'embedding_nearest_family', 'embedding_nearest_subtype', 'pocket_confirmed', 'pocket_vetoed',
  ] },
  { key: 'community', title: 'Community', columns: [
    'community_id', 'community_family', 'community_purity', 'community_subtype',
    'community_subtype_purity', 'community_richness',
  ] },
  { key: 'stability', title: 'Stability', columns: [
    'n_subsamples_containing', 'family_stability', 'subtype_stability',
  ] },
];

const CARD_COLUMNS = CARD_GROUPS.flatMap((group) => group.columns);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const TYPE_MATCHERS = {
  str: nonEmptyString,
  int: Number.isSafeInteger,
  float: Number.isFinite,
  float_or_null: (value) => value === null || Number.isFinite(value),
  bool: (value) => typeof value === 'boolean',
  str_or_null: (value) => value === null || nonEmptyString(value),
};

export function escapeHTML(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderRow(column, value) {
  const kind = value === null ? 'null' : typeof value === 'number' ? 'number' : 'identifier';
  const text = value === null ? 'no value' : String(value);
  return `<tr data-column="${escapeHTML(column)}"><th scope="row" class="identifier">${escapeHTML(column)}</th><td class="${escapeHTML(kind)}">${escapeHTML(text)}</td></tr>`;
}

export async function run({ search, fetch, document }) {
  const container = document.getElementById('gene-card');
  if (container === null) {
    throw new Error('Missing #gene-card container');
  }
  const fail = (message) => {
    container.innerHTML = `<p class="error" role="alert">${escapeHTML(message)}</p>`;
    return 'error';
  };
  const element = document.getElementById('gene-card-data');
  if (element === null) {
    return fail('Missing gene card data');
  }
  let embedded;
  try {
    embedded = JSON.parse(element.textContent);
  } catch (error) {
    return fail(`Cannot read gene card data: ${error.message}`);
  }
  if (!object(embedded) || !object(embedded.types) || !object(embedded.species)) {
    return fail('Invalid gene card data: expected an object with types and species objects');
  }
  const id = new URLSearchParams(search).get('id');
  if (id === null) {
    return 'empty';
  }
  const separator = id.indexOf('|');
  if (separator <= 0 || separator === id.length - 1) {
    return fail(`Invalid gene id (expected <sample>|<original_id>): ${JSON.stringify(id)}`);
  }
  const sample = id.slice(0, separator);
  if (!Object.hasOwn(embedded.species, sample)) {
    return fail(`Unknown species ${JSON.stringify(sample)} for gene ${JSON.stringify(id)}`);
  }
  const species = embedded.species[sample];
  if (!object(species) || !nonEmptyString(species.shard) || !nonEmptyString(species.page) ||
      !nonEmptyString(species.display_name) || !(species.fasta === null || nonEmptyString(species.fasta))) {
    return fail(`Invalid gene card data for species ${JSON.stringify(sample)}`);
  }
  const url = species.shard;
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    return fail(`Cannot load species records ${url}: ${error.message}`);
  }
  if (!response.ok) {
    return fail(`Cannot load species records ${url}: HTTP ${response.status}`);
  }
  let shard;
  try {
    shard = await response.json();
  } catch (error) {
    return fail(`Cannot read species records ${url}: ${error.message}`);
  }
  const invalid = (message) => fail(`Invalid species records ${url}: ${message}`);
  if (!object(shard) || Object.keys(shard).length !== 3 ||
      !['columns', 'data', 'rows_order'].every((key) => Object.hasOwn(shard, key))) {
    return invalid('expected keys columns, data, rows_order');
  }
  if (shard.rows_order !== 'atlas_id') {
    return invalid(`rows_order must be "atlas_id", got ${JSON.stringify(shard.rows_order)}`);
  }
  const { columns, data } = shard;
  if (!Array.isArray(columns) || !columns.every(nonEmptyString) || new Set(columns).size !== columns.length) {
    return invalid('columns must be a list of unique non-empty strings');
  }
  for (const column of CARD_COLUMNS) {
    if (!columns.includes(column)) {
      return invalid(`missing column ${column}`);
    }
  }
  for (const column of columns) {
    if (!CARD_COLUMNS.includes(column)) {
      return invalid(`unexpected column ${column}`);
    }
  }
  if (!object(data) || Object.keys(data).length !== columns.length ||
      !columns.every((column) => Object.hasOwn(data, column))) {
    return invalid('data keys must equal columns');
  }
  if (!Array.isArray(data.atlas_id)) {
    const value = JSON.stringify(data.atlas_id);
    return invalid(`column atlas_id has ${value} values, atlas_id has ${value}`);
  }
  const n = data.atlas_id.length;
  for (const column of columns) {
    const values = data[column];
    if (!Array.isArray(values) || values.length !== n) {
      const count = Array.isArray(values) ? values.length : JSON.stringify(values);
      return invalid(`column ${column} has ${count} values, atlas_id has ${n}`);
    }
  }
  const matches = [];
  for (let index = 0; index < n; index += 1) {
    if (data.atlas_id[index] === id) matches.push(index);
  }
  if (matches.length === 0) {
    return fail(`Gene ${JSON.stringify(id)} is not in ${url}`);
  }
  if (matches.length > 1) {
    return fail(`Gene ${JSON.stringify(id)} appears ${matches.length} times in ${url}`);
  }
  const index = matches[0];
  for (const column of CARD_COLUMNS) {
    if (!Object.hasOwn(embedded.types, column)) {
      return fail(`No exporter type for column ${column}`);
    }
    const type = embedded.types[column];
    if (typeof type !== 'string' || !Object.hasOwn(TYPE_MATCHERS, type)) {
      return fail(`Unknown exporter type ${JSON.stringify(type)} for column ${column}`);
    }
    const value = data[column][index];
    if (!TYPE_MATCHERS[type](value)) {
      return fail(`Invalid ${column} for gene ${JSON.stringify(id)}: expected ${type}, got ${JSON.stringify(value)}`);
    }
  }
  const fastaParagraph = species.fasta === null ? ''
    : `<p><a href="${escapeHTML(species.fasta)}" download>Download species FASTA</a></p>`;
  const speciesSection = `<section class="gene-species" aria-labelledby="gene-species-heading"><h2 id="gene-species-heading">Species</h2><p><a href="${escapeHTML(species.page)}">${escapeHTML(species.display_name)}</a> <span class="identifier">${escapeHTML(sample)}</span></p>${fastaParagraph}</section>`;
  const groups = CARD_GROUPS.map(({ key, title, columns: groupColumns }) => {
    const rows = groupColumns.map((column) => renderRow(column, data[column][index])).join('');
    return `<section class="gene-group" data-group="${escapeHTML(key)}" aria-labelledby="gene-${escapeHTML(key)}-heading"><h2 id="gene-${escapeHTML(key)}-heading">${escapeHTML(title)}</h2><div class="table-scroll"><table><caption>${escapeHTML(title)}</caption><tbody>${rows}</tbody></table></div></section>`;
  }).join('');
  container.innerHTML = `<p class="identifier gene-id">${escapeHTML(id)}</p>${speciesSection}${groups}`;
  return 'card';
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  run({ search: location.search, fetch: (url) => fetch(url), document });
}
