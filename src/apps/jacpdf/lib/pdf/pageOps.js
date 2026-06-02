// Transformations pures sur l'ordre des pages d'un PDF.
// Les pageIndex des annotations pointent vers une POSITION dans visiblePages
// (pas un numéro de page absolu) — d'où le besoin de remap après réorganisation.

// Calcule visiblePages : pageOrder filtré des pages supprimées.
// Fallback à l'ordre naturel si pageOrder n'est pas encore initialisé.
export const computeVisiblePages = (pageOrder, deletedPages, numPages) =>
  (pageOrder.length ? pageOrder : Array.from({ length: numPages }, (_, i) => i + 1))
    .filter(p => !deletedPages.includes(p))

// Construit une fonction de remap : oldVisibleIdx → newVisibleIdx.
// Pour chaque pageIndex existant : retrouve le pageNum auquel il pointait
// (via oldVisible), puis cherche sa nouvelle position dans newVisible.
export const makePageIndexRemap = (oldVisible, newVisible) => (oldIdx) => {
  const pageNum = oldVisible[oldIdx]
  if (pageNum == null) return oldIdx
  const ni = newVisible.indexOf(pageNum)
  return ni === -1 ? oldIdx : ni
}

// Réordonne pageOrder en déplaçant fromPage à la position de toPage.
// Renvoie { newOrder, oldVisible, newVisible } ou null si no-op / invalide.
export const reorderPageOrder = (pageOrder, deletedPages, numPages, fromPage, toPage) => {
  if (fromPage === toPage) return null
  const baseOrder = pageOrder.length ? pageOrder : Array.from({ length: numPages }, (_, i) => i + 1)
  const oldVisible = baseOrder.filter(p => !deletedPages.includes(p))
  const newOrder = [...baseOrder]
  const fromIdx = newOrder.indexOf(fromPage)
  const toIdx = newOrder.indexOf(toPage)
  if (fromIdx === -1 || toIdx === -1) return null
  const [moved] = newOrder.splice(fromIdx, 1)
  newOrder.splice(toIdx, 0, moved)
  const newVisible = newOrder.filter(p => !deletedPages.includes(p))
  return { newOrder, oldVisible, newVisible }
}

// Réinitialise pageOrder à l'ordre naturel + restaure toutes les pages supprimées.
// Renvoie { newOrder, oldVisible, newVisible } pour le remap des annotations.
export const resetPageOrder = (pageOrder, deletedPages, numPages) => {
  const naturalOrder = Array.from({ length: numPages }, (_, i) => i + 1)
  const baseOrder = pageOrder.length ? pageOrder : naturalOrder
  const oldVisible = baseOrder.filter(p => !deletedPages.includes(p))
  const newVisible = naturalOrder
  return { newOrder: naturalOrder, oldVisible, newVisible }
}