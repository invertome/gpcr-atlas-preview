import { escapeHTML, formatSequence, formatCount, evidenceValue, speciesNameHTML, ligandTypeLabel, receptorFamilyLabel, evidenceReceptorLabel, finalCallTier, tierLabel, stateHelp, stateName, columnLabel, ABSTENTIONS, FINAL_CALL, DISTANCE } from './display.js';
export { escapeHTML } from './display.js';
export { CARD_GROUPS } from './display.js';
import { CARD_GROUPS } from './display.js';

const CALL_STATES = ['known', 'novel_family', 'novel_subtype', 'subtype_unresolved', 'subtype_blocked'];
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

// Reasons a rescue to the nearest ligand type was refused. The Methods page defines each one.
const RESCUE_REASONS = {
  'envelope-vetoed': 'it lies outside the distance limit for that ligand type',
  'pocket-contradicts': 'its pocket residue contradicts that ligand type',
  'embedding-inconsistent': 'its embedding neighborhood does not consistently support that ligand type',
};
function evidenceText(value, terms) {
  // Keep values and ligand names intact while expanding the evidence descriptors.
  const normalized = value.replace(/<=cut/g, ' at or below the threshold');
  return normalized.split(/([()+,]|=|\s+(?=[a-z][a-z-]*=))/).map((part, index, parts) => {
    if (parts[index - 1] === '=') return part;
    if (part === '(') return ' (';
    if (part === '=') return ': ';
    if (part === '+') return '; ';
    if (/^[(),]$/.test(part) || /^\s*$/.test(part)) return part;
    if (part.trim() === 'rich') return part.replace('rich', 'Reference sequences');
    const rescue = part.match(/^(\s*)rescue-to-(.+)-(envelope-vetoed|pocket-contradicts|embedding-inconsistent)$/);
    if (rescue) return `${rescue[1]}Not rescued to ${rescue[2]}, because ${RESCUE_REASONS[rescue[3]]}`;
    const text = part.replace(/\b(family|subtype)\b/g, term => terms[term]).replace(/-/g, ' ');
    return text.replace(/^(\s*)([a-z])/, (_, space, letter) => space + letter.toUpperCase());
  }).join('');
}

// Link the first use of each Methods term on the card. html is escaped text without tags.
const METHODS_TERMS = [[/\bpocket\b/i, 'pocket-evidence'], [/\bstability\b/i, 'stability'], [/\bNot rescued to\b/, 'rescue']];
function linkMethodsTerms(html, methods, linked) {
  for (const [pattern, anchor] of METHODS_TERMS) {
    if (linked.has(anchor) || !pattern.test(html)) continue;
    html = html.replace(pattern, term => `<a href="${escapeHTML(methods)}#${anchor}">${term}</a>`);
    linked.add(anchor);
  }
  return html;
}
function renderRow(column, value, { labels, state_names: stateNames, evidence_terms: evidenceTerms, ligand_type_keys: keys }, record) {
  const kind = value === null ? 'null' : typeof value === 'number' ? 'number' :
    ['call_state', 'call_basis', 'subtype_call_basis'].includes(column) ? 'prose' : 'identifier';
  let text = column === 'call_state' ? stateNames[value] : evidenceValue(value);
  if (column === 'call_basis' || column === 'subtype_call_basis' ||
      (column === 'subtype_agreement_level' && value === 'divergent-known-subtype')) {
    text = evidenceText(text, evidenceTerms);
  }
  const ligandColumns = ['family_call', 'novelty_family_call', 'nearest_family', 'embedding_nearest_family',
    'community_family'];
  const receptorColumns = ['subtype_call', 'novelty_subtype_call', 'nearest_subtype', 'embedding_nearest_subtype', 'community_subtype'];
  if (record && ligandColumns.includes(column) && value !== null) text = ligandTypeLabel(value);
  if (record && receptorColumns.includes(column) && value !== null) {
    text = column === 'subtype_call' ? receptorFamilyLabel(record.family_call, value, keys) : evidenceReceptorLabel(value, keys);
  }
  return `<tr data-column="${escapeHTML(column)}"><th scope="row">${escapeHTML(labels[column])}</th><td class="${escapeHTML(kind)}">${escapeHTML(text)}</td></tr>`;
}

function renderValue(column, row, embedded) {
  if (column === 'family_call') return escapeHTML(ligandTypeLabel(row[column]));
  if (column === 'subtype_call') return escapeHTML(receptorFamilyLabel(row.family_call, row[column], embedded.ligand_type_keys));
  const markup = renderRow(column, row[column], embedded, row);
  return markup.match(/<td[^>]*>([\s\S]*)<\/td>/)[1];
}

export function sequenceRecord(text, id) {
  let current = null, sequence = [], match = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('>')) {
      if (current === id) {
        if (match !== null) throw new Error(`Duplicate FASTA header: ${id}`);
        match = sequence.join('');
      }
      current = line.slice(1).split(/\s/)[0]; sequence = [];
    } else if (current === id) sequence.push(line.trim());
  }
  if (current === id) {
    if (match !== null) throw new Error(`Duplicate FASTA header: ${id}`);
    match = sequence.join('');
  }
  return match;
}
export async function loadSequence(path, id, fetch) {
  if (!path) return { reason: 'no FASTA file in this export.' };
  if (typeof DecompressionStream === 'undefined') return { reason: 'this browser cannot decode gzip files.' };
  try {
    const reply = await fetch(path);
    if (!reply.ok) return { reason: `FASTA request returned HTTP ${reply.status}.` };
    const bytes = new Uint8Array(await reply.arrayBuffer());
    const compressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const text = compressed ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(bytes);
    const sequence = sequenceRecord(text, id);
    if (sequence === null) return { reason: 'no exact FASTA header match.' };
    return sequence.length ? { text: sequence } : { reason: 'the matching FASTA record is empty.' };
  } catch (error) { return { reason: `cannot read FASTA (${error.message}).` }; }
}

const activeCards = new WeakMap();

export async function run({ search, fetch, document }) {
  const container = document.getElementById('gene-card');
  if (container === null) {
    throw new Error('Missing #gene-card container');
  }
  const ticket = Symbol();
  activeCards.set(container, ticket);
  const current = () => activeCards.get(container) === ticket;
  const fail = (message) => {
    if (!current()) return 'superseded';
    container.innerHTML = `<p class="error" role="alert">${escapeHTML(message)}</p>`;
    return 'error';
  };
  try {
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
    if (!nonEmptyString(embedded.methods) || !object(embedded.labels) || !CARD_COLUMNS.every(column => nonEmptyString(embedded.labels[column])) ||
        !Array.isArray(embedded.hidden_columns) || !embedded.hidden_columns.every(column => CARD_COLUMNS.includes(column)) ||
        !object(embedded.state_names) || !CALL_STATES.every(state => Object.hasOwn(embedded.state_names, state) && nonEmptyString(embedded.state_names[state])) ||
        !object(embedded.evidence_terms) ||
        !['family', 'subtype'].every(term => nonEmptyString(embedded.evidence_terms[term]))) {
      return fail('Invalid gene card display labels');
    }
    const hiddenColumns = new Set(embedded.hidden_columns);
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
        return invalid(`missing column ${embedded.labels[column]}`);
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
      return invalid(`column Atlas ID has ${value} values, Atlas ID has ${value}`);
    }
    const n = data.atlas_id.length;
    for (const column of columns) {
      const values = data[column];
      if (!Array.isArray(values) || values.length !== n) {
        const count = Array.isArray(values) ? values.length : JSON.stringify(values);
        return invalid(`column ${embedded.labels[column]} has ${count} values, Atlas ID has ${n}`);
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
        return fail(`No exporter type for column ${embedded.labels[column]}`);
      }
      const type = embedded.types[column];
      if (typeof type !== 'string' || !Object.hasOwn(TYPE_MATCHERS, type)) {
        return fail(`Unknown exporter type ${JSON.stringify(type)} for column ${embedded.labels[column]}`);
      }
      const value = data[column][index];
      if (!TYPE_MATCHERS[type](value)) {
        return fail(`Invalid ${embedded.labels[column]} for gene ${JSON.stringify(id)}: expected ${type}, got ${JSON.stringify(value)}`);
      }
    }
    if (!CALL_STATES.includes(data.call_state[index])) return invalid('Unknown distance from characterized receptors');
    const row = Object.fromEntries(columns.map(column => [column, data[column][index]]));
    let tier;
    try { tier = finalCallTier(row.family_call, row.subtype_call, embedded.ligand_type_keys); }
    catch (error) { return invalid(error.message); }
    const ligand = ABSTENTIONS.includes(row.family_call)
      ? `${tierLabel('none')} (${ligandTypeLabel(row.family_call)})` : ligandTypeLabel(row.family_call);
    const summary = [['Ligand type', ligand], ['Receptor family', receptorFamilyLabel(row.family_call, row.subtype_call, embedded.ligand_type_keys)],
      [FINAL_CALL, tierLabel(tier)], [DISTANCE, stateName(row.call_state)]];
    const checklist = [
      ['pass_pf00001', ['pf00001_E_Z43318']], ['pass_ps50262', ['ps50262_nscore']],
      ['pass_cdd', ['cdd_top7tm', 'cdd_top7tm_E']], ['pass_tm', ['n_tm']], ['pass_sr', ['sr_ga_families']],
    ].map(([key, values]) => `<li><span role="img" aria-label="${row[key] ? 'Pass' : 'Fail'}">${row[key] ? '✓' : '✗'}</span> ${escapeHTML(columnLabel(key))}<small>${values.map(k => `${escapeHTML(columnLabel(k))}: <span data-column="${escapeHTML(k)}">${escapeHTML(evidenceValue(row[k]))}</span>`).join('; ')}</small></li>`).join('');
    const linked = new Set();
    const linkTerms = html => linkMethodsTerms(html, embedded.methods, linked);
    const evidence = CARD_GROUPS.filter(g => !['identity', 'gate'].includes(g.key)).map(group =>
      `<section data-group="${group.key}"><h3>${linkTerms(escapeHTML(group.title))}</h3><dl>${group.columns.filter(c => !hiddenColumns.has(c)).map(c =>
        `<dt>${linkTerms(escapeHTML(columnLabel(c)))}</dt><dd>${linkTerms(renderValue(c, row, embedded))}</dd>`).join('')}</dl></section>`).join('');
    const allFields = CARD_GROUPS.map(group => `<section class="gene-group" data-group="${group.key}"><h3>${escapeHTML(group.title)}</h3><div class="table-scroll"><table><caption>${escapeHTML(group.title)}</caption><tbody>${group.columns.filter(c => !hiddenColumns.has(c)).map(c => renderRow(c, row[c], embedded, row)).join('')}</tbody></table></div></section>`).join('');
    if (!current()) return 'superseded';
    container.innerHTML = `<header class="gene-header"><h1>${escapeHTML(row.original_id)}</h1><p>${escapeHTML(columnLabel('gene_id'))}: ${escapeHTML(row.gene_id)}</p><p><a href="${escapeHTML(species.page)}">${speciesNameHTML(species.display_name)}</a> · ${formatCount(row.length)} aa</p><p class="identifier">${row.atlas_id.split('|').map((part, index, parts) => `<span>${escapeHTML(part)}${index < parts.length - 1 ? '|' : ''}</span>${index < parts.length - 1 ? '<wbr>' : ''}`).join('')}</p></header>`
      + `<dl class="gene-summary">${summary.map(([label, value], index) => `<dt>${escapeHTML(label)}</dt><dd${index < 2 ? ' class="primary-call"' : ''}${label === DISTANCE ? ` title="${escapeHTML(stateHelp(row.call_state))}"` : ''}>${escapeHTML(value)}</dd>`).join('')}</dl>`
      + `<details class="gene-evidence"><summary>Evidence</summary><h2>Class-A filter</h2><ul>${checklist}</ul><div class="gene-evidence-grid"><dl>${['class_a_excluded', 'gate_verdict', 'gate_reason'].map(c => `<dt>${escapeHTML(columnLabel(c))}</dt><dd>${escapeHTML(evidenceValue(row[c]))}</dd>`).join('')}</dl>${evidence}</div></details>`
      + `<details class="gene-fields"><summary>Show all fields (${formatCount(columns.filter(c => !hiddenColumns.has(c)).length)})</summary>${allFields}</details><section id="external-records" hidden></section>`;
    const empty = document.getElementById('gene-empty');
    if (empty) empty.hidden = true;
    const sequence = await loadSequence(species.fasta, id, fetch);
    const append = html => {
      if (container.insertAdjacentHTML) container.insertAdjacentHTML('beforeend', html);
      else container.innerHTML += html;
    };
    if (!current()) return 'superseded';
    if (sequence.reason) append(`<section><h2>Sequence</h2><p>Sequence not available: ${escapeHTML(sequence.reason)}</p></section>`);
    else {
      const wrapped = sequence.text.match(/.{1,60}/g).join('\n');
      const fasta = `>${id}\n${wrapped}\n`;
      append(`<section><h2>Sequence</h2><pre class="sequence sequence-desktop">${escapeHTML(formatSequence(sequence.text, 60))}</pre><pre class="sequence sequence-mobile">${escapeHTML(formatSequence(sequence.text, 30))}</pre><button type="button" data-copy-sequence>Copy</button> <a download="${escapeHTML(row.original_id)}.fasta" href="data:text/plain;charset=utf-8,${encodeURIComponent(fasta)}">Download FASTA</a><p data-sequence-status role="status"></p></section>`);
      const copy = container.querySelector?.('[data-copy-sequence]');
      copy?.addEventListener('click', async () => {
        const status = container.querySelector('[data-sequence-status]');
        try { await navigator.clipboard.writeText(sequence.text); status.textContent = 'Sequence copied.'; }
        catch { status.textContent = 'Copy unavailable. Select the sequence to copy it.'; }
      });
    }
    return 'card';
  } catch (error) { return fail(`Cannot render gene card: ${error.message}`); }
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  run({ search: location.search, fetch: (url) => fetch(url), document });
}
