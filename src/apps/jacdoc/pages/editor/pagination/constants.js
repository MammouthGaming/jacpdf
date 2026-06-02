// Constantes papier/layout partagées par le moteur de pagination JacDoc.
// Gardées dans un fichier dédié pour éviter que JacDocEditor.jsx devienne
// le seul endroit qui connaît toute la géométrie Word-like.

export const PAGE_W_PX = 816
export const PAGE_H_PX = 1056
export const PAGE_GAP_PX = 24

export const PX_PER_CM = 37.795275591
export const RULER_V_MIN_TICK_COUNT = 28

export const DEFAULT_RULER_SETTINGS = {
  marginLeft: 96,
  marginRight: 96,
  marginTop: 72,
  marginBottom: 72,
  firstIndent: 0,
  hangingIndent: 0,
  rightIndent: 0,
  tabType: 'left',
  tabStops: [],
}