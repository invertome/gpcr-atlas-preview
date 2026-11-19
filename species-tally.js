const tally = document.querySelector('[data-tally]');
const table = document.querySelector('#species-receptors table');
if (tally && table) {
  // Capture the original row order before the sortable table can reorder its DOM.
  const rows = [...table.querySelectorAll('tbody tr')];
  const record = target => {
    const square = target.closest?.('[data-r]');
    if (!square || !tally.contains(square)) return null;
    const row = rows[Number(square.dataset.r)];
    if (!row) throw new Error(`Missing receptor table row: ${square.dataset.r}`);
    return { square, row };
  };
  tally.addEventListener('pointerover', event => {
    const hit = record(event.target);
    if (!hit) return;
    const cells = hit.row.cells;
    hit.square.dataset.tip = [cells[0], cells[3], cells[4], cells[5]].map(cell => cell.textContent.trim()).join(' · ');
  });
  tally.addEventListener('click', event => {
    const hit = record(event.target);
    if (hit) window.location.assign(hit.row.querySelector('a').href);
  });
}
