// Repertoire matrix controls on the species index: the table works without this script, which reveals and wires the collapse buttons.
export function setGroupExpanded(button, rows, expanded) {
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  for (const row of rows) row.hidden = !expanded;
}

export function initHeatmap(root) {
  const controls = root.querySelector('.heatmap-controls');
  if (!controls) throw new Error('Heatmap controls are missing');
  const groups = [...root.querySelectorAll('button.group-toggle')].map((button) => {
    const id = button.getAttribute('aria-controls');
    const body = root.querySelector(`tbody[id="${id}"]`);
    if (!body) throw new Error(`Heatmap toggle controls a missing group: ${id}`);
    return { button, rows: [...body.querySelectorAll('tr[data-sample]')] };
  });
  for (const { button, rows } of groups) {
    button.addEventListener('click', () => setGroupExpanded(button, rows, button.getAttribute('aria-expanded') !== 'true'));
    button.hidden = false;
  }
  for (const action of controls.querySelectorAll('button[data-heatmap-action]')) {
    const name = action.getAttribute('data-heatmap-action');
    if (name !== 'collapse' && name !== 'expand') throw new Error(`Unknown heatmap action: ${name}`);
    action.addEventListener('click', () => {
      for (const { button, rows } of groups) setGroupExpanded(button, rows, name === 'expand');
    });
  }
  controls.hidden = false;
}

if (typeof document !== 'undefined') {
  for (const root of document.querySelectorAll('[data-heatmap-root]')) initHeatmap(root);
}
