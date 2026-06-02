import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Pushes de blocs entiers Word-like via Decoration.node.
//
// PROBLÈME RÉSOLU ICI : appliquer un marginTop inline directement sur
// le DOM (el.style.marginTop = X) ne survit pas aux redraws de
// ProseMirror. Quand son MutationObserver détecte le changement de
// style sur un <p>, ProseMirror flag le node comme « dirty » et le
// recrée via schema.toDOM() au prochain update du docView — effaçant
// notre marginTop. Résultat empirique observé : la pagination JS
// calcule correctement (page 2 apparaît, neededPages incrémente),
// mais visuellement le paragraphe reste collé à la limite de page,
// et le curseur reste coincé dans la marge basse noire au lieu de
// migrer vers le haut de la page suivante comme Word le ferait.
//
// SOLUTION : passer par le système de Decoration.node de ProseMirror.
// Une Decoration.node applique des attrs (style, class, etc.) sur le
// DOM d'un node. La decoration est GÉRÉE PAR PROSEMIRROR LUI-MÊME et
// rendue à chaque pass de update du docView — donc elle ne peut PAS
// être effacée par son propre MutationObserver. Le push survit
// naturellement à travers toutes les passes de redraw.
//
// FLOW :
//   1) Le moteur de pagination dans JacDocEditor.jsx calcule et
//      applique les pushes via mutation DOM directe (style.marginTop).
//      Ça donne un retour synchrone IMMÉDIAT pour les calculs
//      d'offsetTop des blocs suivants dans la même pass.
//   2) À la fin de chaque pass, le moteur appelle setBlockPushes()
//      avec la liste finale { pos, marginPx } pour chaque paragraphe
//      poussé.
//   3) setBlockPushes() dispatch une transaction avec meta pour mettre
//      à jour ce plugin. La transaction est marquée
//      'jacdocBlockPushUpdate' pour que la pagination ne se relance
//      pas inutilement (sinon boucle infinie).
//   4) Le plugin applique les pushes via Decoration.node — c'est
//      cette couche qui rend le marginTop persistant. Si ProseMirror
//      efface notre style inline, la decoration reste et le push est
//      toujours visible. Word-like.
//
// Le marginTop est donc appliqué EN DOUBLE : inline (immédiat,
// synchrone) + decoration (persistant). Les deux disent
// 'margin-top: Xpx !important' donc ils ne se battent pas, ils se
// renforcent.

export const paginationBlockPushPluginKey = new PluginKey(
  'jacdocBlockPushPlugin',
)

const META_KEY = 'jacdocBlockPushes'
const META_UPDATE_KEY = 'jacdocBlockPushUpdate'

function isValidPush(p) {
  return (
    p &&
    Number.isFinite(p.pos) &&
    Number.isFinite(p.marginPx) &&
    p.marginPx > 0
  )
}

function buildDecorationSet(doc, pushes) {
  if (!Array.isArray(pushes) || pushes.length === 0) {
    return DecorationSet.empty
  }
  const decos = []
  const docSize = doc.content.size
  for (const p of pushes) {
    if (!isValidPush(p)) continue
    const safePos = Math.max(
      0,
      Math.min(Math.floor(p.pos), Math.max(0, docSize - 1)),
    )
    let nodeAfter = null
    try {
      const resolved = doc.resolve(safePos)
      nodeAfter = resolved.nodeAfter
    } catch (_) {
      continue
    }
    if (!nodeAfter) continue
    const from = safePos
    const to = safePos + nodeAfter.nodeSize
    decos.push(
      Decoration.node(from, to, {
        // !important pour battre les règles CSS qui posent un margin-top
        // sur les paragraphes (.ProseMirror > * + * { margin-top: 0.75em }
        // et resets éventuels d'extensions Tiptap).
        style: 'margin-top: ' + Math.round(p.marginPx) + 'px !important',
      }),
    )
  }
  return DecorationSet.create(doc, decos)
}

/**
 * Synchronise les decorations block-push avec les pushes calculés par le
 * moteur de pagination. No-op si la nouvelle liste est identique à
 * l'actuelle (évite les dispatches en boucle).
 */
export function setBlockPushes(editor, pushes) {
  if (!editor || editor.isDestroyed) return false
  const view = editor.view
  if (!view) return false
  const safePushes = Array.isArray(pushes)
    ? pushes
        .filter(isValidPush)
        .map((p) => ({
          pos: Math.floor(p.pos),
          marginPx: Math.round(p.marginPx),
        }))
    : []
  const state = paginationBlockPushPluginKey.getState(view.state)
  const current = state?.pushes || []
  const sameLength = current.length === safePushes.length
  const same =
    sameLength &&
    current.every((p, i) => {
      const next = safePushes[i]
      return next && p.pos === next.pos && p.marginPx === next.marginPx
    })
  if (same) return false
  const tr = view.state.tr
    .setMeta(paginationBlockPushPluginKey, { pushes: safePushes })
    .setMeta(META_UPDATE_KEY, true)
    .setMeta('addToHistory', false)
  view.dispatch(tr)
  return true
}

export const PaginationBlockPushExtension = Extension.create({
  name: 'paginationBlockPush',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paginationBlockPushPluginKey,
        state: {
          init: () => ({
            pushes: [],
            decos: DecorationSet.empty,
          }),
          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(paginationBlockPushPluginKey)
            if (meta && Array.isArray(meta.pushes)) {
              return {
                pushes: meta.pushes,
                decos: buildDecorationSet(newState.doc, meta.pushes),
              }
            }
            if (!tr.docChanged) return prev
            // Le document a changé sans qu'on ait re-synchronisé : on
            // remappe les positions des pushes existants. Si une node
            // poussée a été supprimée, on la retire du set. Le prochain
            // pass de pagination recalculera de toute façon des pushes
            // frais ; cette étape sert juste à ne pas afficher un push
            // sur le mauvais paragraphe pendant le frame intermédiaire.
            const mapped = []
            for (const p of prev.pushes) {
              const result = tr.mapping.mapResult(p.pos, -1)
              if (result.deleted) continue
              mapped.push({ pos: result.pos, marginPx: p.marginPx })
            }
            return {
              pushes: mapped,
              decos: buildDecorationSet(newState.doc, mapped),
            }
          },
        },
        props: {
          decorations(state) {
            const s = paginationBlockPushPluginKey.getState(state)
            return s?.decos || null
          },
        },
      }),
    ]
  },
})