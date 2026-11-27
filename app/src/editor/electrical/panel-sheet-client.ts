// EZD-708c (S06 Events emitted "sheet.updated (new) on Add to E2.0"): the browser side of the event. The placement
// itself is a model edit (the permit set's `panelSheets`, saved with the model); this only asks the server to log
// sheet.updated. A failure is dropped: the placement stands without its log row. Browser only.
export type PanelSheetPlaced = { sheet: string; panelId: string };

export function notifyPanelSheet(
  projectId: string,
  placed: PanelSheetPlaced,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<boolean> {
  return fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/panel-sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(placed),
  }).then(
    (r) => r.ok,
    () => false,
  );
}
