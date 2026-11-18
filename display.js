// Plain-language names shown on the site for export keys. One place, so the copy pass edits one file.
// Displayed columns require reviewed labels; unknown columns stop the build.
import { STATE_ORDER } from './vocabulary.mjs';
export { STATE_ORDER };

export function formatSequence(sequence, width = 60) {
  if (width !== 30 && width !== 60) throw new Error(`Invalid sequence line width: ${width}`);
  const lines = [];
  for (let start = 0; start < sequence.length; start += width) {
    const groups = sequence.slice(start, start + width).match(/.{1,10}/g);
    lines.push(`${start + 1} ${groups.join(' ')}`);
  }
  return lines.join('\n');
}

const STATES = {
  known: ['Known receptor family', '--color-state-known',
    'Within the novelty threshold of a characterized receptor family.'],
  novel_subtype: ['New receptor family in a known ligand type', '--color-state-novel-subtype',
    'Within a known ligand type, but past the novelty threshold of every receptor family in it.'],
  subtype_unresolved: ['Ligand type known, receptor family unresolved', '--color-state-unresolved',
    'Assigned to a ligand type. The nearest receptor family is a catch-all group, so no receptor family is named.'],
  novel_family: ['Beyond all known ligand types', '--color-state-novel-family',
    'Past the novelty threshold of every known ligand type.'],
  subtype_blocked: ['Ligand type known, receptor family call unreliable', '--color-state-blocked',
    'Assigned to a ligand type. No receptor family is called, because in tests on characterized receptors left out of the reference set, most receptors assigned to the nearest receptor family belonged to other receptor families.'],
};

const ABSTENTION_NAMES = {
  'community-orphan': ['Orphan community',
    'The receptor clusters with other atlas receptors in an embedding community that holds too few characterized receptors, so no ligand type is assigned.'],
  unassigned: ['Unassigned', 'No ligand type passed the agreement rules for this receptor.'],
};

const ORIGINS = {
  braker: 'Genome assembly, BRAKER gene models',
  ingest: 'Genome assembly, published annotation',
  transcriptome: 'Transcriptome assembly',
};

export const COLUMN_LABELS = {
  "family_call": "Ligand type call",
  "novelty_family_call": "Ligand type novelty call",
  "family_distance": "Squared distance to nearest ligand type",
  "family_above": "Beyond ligand type novelty threshold",
  "nearest_family": "Nearest ligand type",
  "embedding_nearest_family": "Nearest ligand type in embedding",
  "community_family": "Community ligand type",
  "family_stability": "Ligand type stability",
  "subtype_call": "Receptor family call",
  "novelty_subtype_call": "Receptor family novelty call",
  "subtype_distance": "Squared distance to nearest receptor family",
  "subtype_above": "Beyond receptor family novelty threshold",
  "nearest_subtype": "Nearest receptor family",
  "subtype_agreement_level": "Receptor family confidence level",
  "subtype_call_basis": "Receptor family call basis",
  "embedding_nearest_subtype": "Nearest receptor family in embedding",
  "community_subtype": "Community receptor family",
  "community_subtype_purity": "Community receptor family purity",
  "subtype_stability": "Receptor family stability",
  "atlas_id": "Atlas ID",
  "original_id": "Protein ID",
  "gene_id": "Gene",
  "sr_ga_families": "Pfam serpentine receptor families",
  "length": "Length, aa",
  "call_state": "Distance from characterized receptors",
  "agreement_level": "Ligand type confidence level",
  "call_basis": "Ligand type call basis",
  "pf00001_E_Z43318": "Pfam 7tm_1 match E-value (fixed search space)",
  "pf00001_E_ownZ": "Pfam 7tm_1 match E-value (proteome search space)",
  "pass_pf00001": "Passes Pfam 7tm_1 filter",
  "pass_pf00001_ownZ": "Passes Pfam filter with proteome search space",
  "ps50262_nscore": "PROSITE PS50262 normalized score",
  "pass_ps50262": "Passes PROSITE filter",
  "pass_sr": "Passes Pfam serpentine receptor filter",
  "cdd_top7tm": "Top CDD 7TM model",
  "cdd_top7tm_E": "Top CDD 7TM match E-value",
  "pass_cdd": "Passes CDD filter",
  "class_a_excluded": "Excluded from class-A GPCRs",
  "n_tm": "Predicted transmembrane helices",
  "pass_tm": "Passes transmembrane filter",
  "gate_verdict": "Class-A filter result",
  "gate_reason": "Class-A filter explanation",
  "rep_tie": "Representative sequence tie",
  "pocket_confirmed": "Pocket-confirmed ligand type",
  "pocket_vetoed": "Pocket-vetoed ligand type",
  "community_id": "Community ID",
  "community_purity": "Community ligand type purity",
  "community_richness": "Reference sequences in the community",
  "n_subsamples_containing": "Resampling runs containing this receptor",
  "n_in": "Input proteins",
  "n_gate_pass": "Proteins passing the class-A filter",
  "n_genes": "Genes in the input",
  "n_gene_unresolved": "Proteins without a resolved gene",
  "n_policy_admitted": "Genes admitted by policy",
  "n_policy_rejected": "Genes rejected by policy",
  "n_policy_unmeasured": "Genes with an unmeasured policy result",
  "n_rep_tie": "Representative sequence ties",
  "n_skipped_itemized": "Itemized skipped records",
  "n_scored": "Records scored for novelty",
  "n_pocket": "Records processed for pocket evidence",
  "n_calls": "Records with calls",
  "n_classified": "Records classified",
  "n_stability": "Records processed for stability",
  "n_never_subsampled": "Records absent from all resampling runs",
  "chain_closed": "Coverage chain closed",
  "cls": "Class",
  "clade": "Clade",
  "origin": "Annotation source",
  "taxid": "Sample taxid",
  "resolved_taxid": "NCBI taxid",
  "n_classA": "Class-A GPCRs",
  "busco_complete_pct": "Proteome completeness, % (BUSCO)",
  "xyz": "Coordinates",
  "species": "Species",
  "sample": "Sample ID"
};

export const HIDDEN_COLUMNS = new Set(['pf00001_E_ownZ', 'pass_pf00001_ownZ', 'rep_tie']);

export function columnLabel(key) {
  if (!Object.hasOwn(COLUMN_LABELS, key)) throw new Error(`Missing display label: ${key}`);
  return COLUMN_LABELS[key];
}

const oldTierToken = key => /(?:^|[^a-z0-9])(?:family|families|subtype|subtypes)(?:$|[^a-z0-9])/i.test(
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'));
const tierColumn = key => key !== 'sr_ga_families' && oldTierToken(key);

export function downloadHeader(columns, column) {
  if (tierColumn(column) && !Object.hasOwn(columns, column) && !Object.values(columns).includes(column)) {
    throw new Error(`Missing download column rename: ${column}`);
  }
  return Object.hasOwn(columns, column) ? columns[column] : column;
}

export function validateDownloadColumns(columns) {
  if (columns === null || typeof columns !== 'object' || Array.isArray(columns)) {
    throw new Error('Invalid download_columns: expected an object');
  }
  for (const column of Object.keys(COLUMN_LABELS).filter(tierColumn)) {
    if (!Object.hasOwn(columns, column)) throw new Error(`Invalid download_columns: missing ${column}`);
  }
  for (const [column, header] of Object.entries(columns)) {
    columnLabel(column);
    if (typeof header !== 'string' || !/^[a-z][a-z0-9_]*$/.test(header) ||
        oldTierToken(header.replace(/(?:^|_)receptor_famil(?:y|ies)(?=_|$)/g, '_'))) {
      throw new Error(`Invalid download_columns header for ${column}`);
    }
  }
  if (new Set(Object.values(columns)).size !== Object.keys(columns).length) {
    throw new Error('Invalid download_columns: duplicate headers');
  }
}

export const EVIDENCE_TERMS = Object.freeze({ family: 'ligand type', subtype: 'receptor family' });

export function stateName(key) {
  if (!Object.hasOwn(STATES, key)) throw new Error(`Unknown call state: ${key}`);
  return STATES[key][0];
}
export const stateToken = key => STATES[key]?.[1] ?? '--color-other';
export const stateHelp = key => STATES[key]?.[2] ?? null;
export const familyLabel = key => ligandTypeLabel(key);
export const abstentionHelp = family => ABSTENTION_NAMES[family]?.[1] ?? null;
export const originName = origin => ORIGINS[origin] ?? origin;

// Validate every state before putting it in the shared display order.
export function orderedStates(keys) {
  keys.forEach(stateName);
  return STATE_ORDER.filter(key => keys.includes(key));
}

export const ABSTENTIONS = Object.freeze(['community-orphan', 'unassigned']);
export const TIERS = Object.freeze([
  { key: 'named', label: 'Receptor family named' },
  { key: 'ligand_only', label: 'Ligand type only' },
  { key: 'none', label: 'No ligand type' },
]);
export const UNIT = Object.freeze({ one: 'receptor', many: 'receptors' });
export const NO_RECEPTOR_FAMILY = 'No receptor family named';
export const EMPTY_LIGAND_TYPE = 'No ligand type was assigned to these receptors.';
export const NO_CLASS_ASSIGNED = 'No class assigned';
export const EMPTY_REPERTOIRE = 'No class-A GPCRs were called in this species.';
export const FINAL_CALL = 'Final call';
export const DISTANCE = 'Distance from characterized receptors';
export const FINAL_AXIS = 'Each receptor ends with a named receptor family, a ligand type only, or no ligand type, as set by the agreement rules.';
export const DISTANCE_AXIS = 'Where each receptor sits relative to the novelty threshold of the nearest characterized receptor family and ligand type.';
export const OTHER_LIGANDS = 'Other ligand types';
export const TIER_TOKENS = Object.freeze({ named: '--color-state-known', ligand_only: '--color-state-unresolved', none: '--color-state-novel-family' });

function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}: ${String(value)}`);
}
export function ligandTypeLabel(key) {
  nonempty(key, 'ligand type');
  if (Object.hasOwn(ABSTENTION_NAMES, key)) return ABSTENTION_NAMES[key][0];
  if (/[A-Z]/.test(key)) return key;
  return key[0].toUpperCase() + key.slice(1).replaceAll('-', ' ');
}
export function finalCallTier(ligandType, receptorFamily, ligandTypeKeys) {
  nonempty(ligandType, 'ligand type');
  nonempty(receptorFamily, 'receptor family');
  if (!Array.isArray(ligandTypeKeys) || !ligandTypeKeys.every(key => typeof key === 'string' && key.length)) {
    throw new Error('Invalid ligand type keys');
  }
  if (ABSTENTIONS.includes(ligandType)) return 'none';
  if (ABSTENTIONS.includes(receptorFamily) || receptorFamily === ligandType) return 'ligand_only';
  if (ligandTypeKeys.includes(receptorFamily)) throw new Error(`Inconsistent final call: ${ligandType} / ${receptorFamily}`);
  return 'named';
}
export const tierLabel = key => {
  const tier = TIERS.find(tier => tier.key === key);
  if (!tier) throw new Error(`Unknown final call tier: ${key}`);
  return tier.label;
};
export function receptorFamilyLabel(ligandType, receptorFamily, ligandTypeKeys) {
  return finalCallTier(ligandType, receptorFamily, ligandTypeKeys) === 'named' ? receptorFamily : NO_RECEPTOR_FAMILY;
}
// Evidence columns name their own nearest or community result, independently of the final call.
export function evidenceReceptorLabel(key, ligandTypeKeys) {
  nonempty(key, 'receptor family');
  return ABSTENTIONS.includes(key) || ligandTypeKeys.includes(key) ? ligandTypeLabel(key) : key;
}
export function receptorPairLabel(ligandType, receptorFamily, ligandTypeKeys) {
  if (finalCallTier(ligandType, receptorFamily, ligandTypeKeys) === 'named') return receptorFamily;
  return `${ligandTypeLabel(ligandType)}: ${NO_RECEPTOR_FAMILY} (${evidenceReceptorLabel(receptorFamily, ligandTypeKeys)})`;
}
function countNumber(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid count: ${String(n)}`);
}
function finite(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`Invalid number: ${String(n)}`);
}
export function countNoun(n, one = UNIT.one, many = UNIT.many) {
  countNumber(n); nonempty(one, 'singular noun'); nonempty(many, 'plural noun');
  return n === 1 ? one : many;
}
export function countVerb(n) { countNumber(n); return n === 1 ? 'has' : 'have'; }
export function formatCount(n) { countNumber(n); return n.toLocaleString('en-US'); }
export function formatValue(n) { finite(n); return n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
export function formatChartValue(n) {
  finite(n);
  if (n < 0) throw new Error(`Invalid chart value: ${n}`);
  return formatValue(n);
}
export function formatRate(part, whole, per) {
  for (const n of [part, whole, per]) { finite(n); if (n < 0) throw new Error(`Negative rate argument: ${n}`); }
  if (whole === 0) return null;
  const rate = part / whole * per;
  finite(rate);
  return rate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
export function formatPercent(part, whole) {
  const rate = formatRate(part, whole, 100);
  return rate === null ? null : `${rate}%`;
}
export function formatSize(bytes) {
  countNumber(bytes);
  if (bytes < 1000) return `${formatCount(bytes)} ${countNoun(bytes, 'byte', 'bytes')}`;
  const units = ['KB', 'MB', 'GB'];
  let index = Math.min(2, Math.floor(Math.log10(bytes) / 3) - 1);
  let value = bytes / 1000 ** (index + 1);
  if (Number(value.toPrecision(3)) >= 1000 && index < units.length - 1) { index += 1; value /= 1000; }
  return `${value.toLocaleString('en-US', { minimumSignificantDigits: 3, maximumSignificantDigits: 3 })} ${units[index]}`;
}
export function escapeHTML(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
// Escape text and link the first use of term to href. A missing term stops the build, so a copy edit cannot drop a link silently.
export function linkTermHTML(text, term, href) {
  nonempty(text, 'linked text'); nonempty(term, 'linked term'); nonempty(href, 'link target');
  const at = text.indexOf(term);
  if (at < 0) throw new Error(`Missing linked term ${JSON.stringify(term)} in ${JSON.stringify(text)}`);
  return `${escapeHTML(text.slice(0, at))}<a href="${escapeHTML(href)}">${escapeHTML(term)}</a>${escapeHTML(text.slice(at + term.length))}`;
}
export function speciesNameParts(displayName) {
  nonempty(displayName, 'species display name');
  let afterSpeciesQualifier = false;
  let genus = true;
  return displayName.trim().split(/\s+/).map(text => {
    let italic = false;
    if (!afterSpeciesQualifier) {
      if (['sp.', 'spp.'].includes(text)) afterSpeciesQualifier = true;
      else if (text === 'x' || text === '×') genus = true;
      else if (!['cf.', 'aff.', 'var.', 'subsp.'].includes(text)) {
        italic = genus ? /^[A-Z][a-z-]+$/.test(text) : /^[a-z]+(?:-[a-z]+)*$/.test(text);
        genus = false;
      }
    }
    return { text, italic };
  });
}
export function speciesNameHTML(name) {
  return speciesNameParts(name).map(({ text, italic }) => italic ? `<i>${escapeHTML(text)}</i>` : escapeHTML(text)).join(' ');
}
export function rankDescending(values, value) {
  if (!Array.isArray(values)) throw new Error('Rank values must be an array');
  values.forEach(finite); finite(value);
  return 1 + values.filter(other => other > value).length;
}
export function releaseLine(manifest) {
  nonempty(manifest.roster_version, 'roster version'); nonempty(manifest.operator_tag, 'operator tag');
  nonempty(manifest.export_utc, 'export time');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(manifest.export_utc)) throw new Error('Invalid export time');
  return `Data release ${manifest.roster_version}${manifest.operator_tag.endsWith('_DRAFT') ? ' (draft)' : ''}, ${manifest.export_utc.split('T')[0]}`;
}
export function classLabel(cls, phylum) {
  nonempty(cls, 'class');
  if (cls !== 'unassigned') return cls;
  nonempty(phylum, 'phylum for an unassigned class');
  return `No class rank (${phylum})`;
}
export function evidenceValue(value) {
  if (value === undefined) throw new Error('Missing evidence value');
  if (value === null) return 'not available';
  if (typeof value === 'number') {
    if (value !== 0 && Math.abs(value) < 0.01) return value.toExponential();
    return Number.isSafeInteger(value) && value >= 0 ? formatCount(value) : formatValue(value);
  }
  return String(value);
}

export const CARD_GROUPS = [
  { key: 'identity', title: 'Identity', columns: ['atlas_id', 'original_id', 'gene_id', 'length'] },
  { key: 'gate', title: 'Class-A filter evidence', columns: [
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
