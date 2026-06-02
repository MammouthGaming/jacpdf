import { useEffect, useRef, useState } from 'react'
import {
  listForDoc,
  remove,
  upsert,
} from "@/apps/jacpdf/lib/pdf/annotationsRepo"
import { supabase } from "@/shared/lib/infra/supabase"

const DEBOUNCE_MS = 1000

// Architecture style Kami (cf. Plan Realtime, section "Pivot Kami-style") :
// la table Supabase `annotations` est la SEULE source de vérité pour les
// docs cloud. Le PDF baké sur le storage est un dérivé (preview Drive,
// download externe), jamais consulté comme input par ce hook. À l'open
// d'un doc cloud, EditorInstance n'appelle plus readJacPdfMeta pour les
// annotations — on hydrate uniquement depuis ce hook, qui lit la table.
// Résultat : pas de seed, pas de flag, pas de résurrection après delete.

/**
 * Mirror les annotations locales (drawings + textBoxes) vers la table
 * Supabase `annotations`. Stratégie hybride Option 3 du plan Realtime.
 *
 * @param {object} args
 * @param {string|null|undefined} args.documentId - ID JacPDF Cloud du doc.
 *   null/undefined → mode local-only, aucun appel Supabase.
 * @param {Array} args.drawings - state local des drawings/shapes/images/comments.
 * @param {Array} args.textBoxes - state local des textboxes.
 * @param {(d: Array) => void} args.setDrawings
 * @param {(b: Array) => void} args.setTextBoxes
 * @returns  status, error 
 */
export function useAnnotationsCloudMirror({
  documentId,
  drawings,
  textBoxes,
  setDrawings,
  setTextBoxes,
  // ID du textbox actuellement en cours d'édition (textarea focus). Pendant
  // l'édition, le mirror défère le sync — on save au blur, pas à chaque
  // keystroke. Style Kami exact. null/undefined → aucune textbox en édition.
  currentlyEditingTextboxId,
  // ID Supabase de l'utilisateur courant. Utilisé pour rétro-attribuer
  // (`data.createdBy`) les annotations sans auteur — typiquement les
  // orphelines créées AVANT l'introduction de la feature « masquer par
  // participant ». Sans ça, le filtre `hiddenUserIds` côté EditorInstance
  // les laissait passer (impossible de les rattacher à quelqu'un). Avec
  // ça : à l'ouverture du doc, toute annotation orpheline est patchée
  // localement → l'effet de diff ré-uploade la version taguée → la
  // prochaine session voit un createdBy stable. Dérive : le 1er user à
  // ouvrir le doc après ce commit s'auto-attribue toutes les orphelines
  // (y compris celles d'autres collaborateurs). Acceptable v1 — la
  // dérive disparaît dès que tout le monde a re-saved au moins une fois.
  myUserId,
}) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  // Map<id, { timer, payload }> — coalescing par annotation
  const pendingRef = useRef(new Map())
  // Snapshots pour détecter les diffs entre deux renders
  const lastMirroredRef = useRef({ drawings: new Map(), textBoxes: new Map() })
  // True après l'hydrate initial — bloque les diff effects avant ça
  const hydratedRef = useRef(false)
  const mountedRef = useRef(true)
  // Phase 2 — identifiant unique par session du hook. Tagué sur chaque write
  // sortant (upsert/softDelete) ; les events postgres_changes qui arrivent
  // avec ce nonce sont ignorés (echo prevention — on a déjà fait l'update
  // localement via setState, pas besoin de l'appliquer une 2e fois sinon
  // boucle de re-render).
  const clientNonceRef = useRef(null)
  if (clientNonceRef.current === null) {
    clientNonceRef.current = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  // True après le 1er event SUBSCRIBED. Permet de différencier la connexion
  // initiale (rien à faire, l'hydrate s'en charge) d'une reconnexion (B6.a :
  // refetch + merge pour rattraper les events ratés pendant la déconnexion).
  const hasSubscribedOnceRef = useRef(false)

  // Refs pour ne pas devoir mettre les setters/locals dans les deps
  const setDrawingsRef = useRef(setDrawings)
  const setTextBoxesRef = useRef(setTextBoxes)
  const drawingsRef = useRef(drawings)
  const textBoxesRef = useRef(textBoxes)
  const currentlyEditingTextboxIdRef = useRef(currentlyEditingTextboxId)
  const myUserIdRef = useRef(myUserId)
  useEffect(() => {
    setDrawingsRef.current = setDrawings
    setTextBoxesRef.current = setTextBoxes
    drawingsRef.current = drawings
    textBoxesRef.current = textBoxes
    currentlyEditingTextboxIdRef.current = currentlyEditingTextboxId
    myUserIdRef.current = myUserId
  })

  // ─── Rétro-attribution des annotations sans auteur ───
  // Toute annotation locale dont `createdBy` manque est patchée avec
  // l'ID Supabase de l'utilisateur courant. Le diff effect prend ensuite
  // le relais pour pousser la version taguée vers le cloud. Couvre 3 cas :
  //  1. Drawings + commentaires créés avant le tagging at-source (legacy).
  //  2. Textboxes / images dont les sites de création (useTextBoxes /
  //     handleImageInsert) ne taguent pas encore — ce filet de sécurité
  //     les rattrape ici sans devoir éditer chaque hook.
  //  3. Annotations syncées depuis un client plus ancien qui n'avait pas
  //     encore le tagging (ex. mobile pas encore mis à jour).
  useEffect(() => {
    if (!myUserId || !hydratedRef.current) return
    const hasOrphan = (arr) => arr.some(item => !item.createdBy)
    if (hasOrphan(drawings)) {
      setDrawingsRef.current(prev =>
        prev.map(d => d.createdBy ? d : { ...d, createdBy: myUserId })
      )
    }
    if (hasOrphan(textBoxes)) {
      setTextBoxesRef.current(prev =>
        prev.map(b => b.createdBy ? b : { ...b, createdBy: myUserId })
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId, drawings, textBoxes])
  useEffect(() => () => { mountedRef.current = false }, [])

  const setStatusSafe = (s) => { if (mountedRef.current) setStatus(s) }

  // ─── Hydrate initial : override si table non vide, seed sinon ───
  useEffect(() => {
    if (!documentId) {
      hydratedRef.current = true
      setStatusSafe('idle')
      return
    }
    let cancelled = false
    hydratedRef.current = false
    setStatusSafe('loading')
    setError(null)

    listForDoc(documentId)
      .then(rows => {
        if (cancelled) return
        if (rows.length > 0) {
          // OVERRIDE : la table cloud est la source unique de vérité.
          const cloudDrawings = []
          const cloudTextBoxes = []
          for (const r of rows) {
            const ann = { ...r.data, id: r.id, pageIndex: r.page_index }
            if (r.type === 'textbox') cloudTextBoxes.push(ann)
            else cloudDrawings.push(ann)
          }
          setDrawingsRef.current(cloudDrawings)
          setTextBoxesRef.current(cloudTextBoxes)
          lastMirroredRef.current.drawings = new Map(cloudDrawings.map(d => [String(d.id), d]))
          lastMirroredRef.current.textBoxes = new Map(cloudTextBoxes.map(b => [String(b.id), b]))
        } else {
          // Cloud vide. Architecture Kami : la table est la SEULE source de
          // vérité. PAS de seed depuis le state local (ça causait la résurrection
          // après delete car le PDF baké restait stale au refresh). On snapshot
          // juste le state local actuel pour que le diff effect ne ré-uploade pas
          // — au cas où EditorInstance aurait initialisé le state localement
          // (mode local fallback). Si le state est aussi vide à ce moment-là,
          // l'éditeur affiche un doc blanc. C'est l'attendu : l'user supprime
          // tout, refresh → cloud vide → éditeur vide. Pas de zombie du PDF baké.
          const localDrawings = drawingsRef.current || []
          const localTextBoxes = textBoxesRef.current || []
          lastMirroredRef.current.drawings = new Map(localDrawings.map(d => [String(d.id), d]))
          lastMirroredRef.current.textBoxes = new Map(localTextBoxes.map(b => [String(b.id), b]))
        }
        hydratedRef.current = true
        setStatusSafe('synced')
      })
      .catch(err => {
        if (cancelled) return
        if (import.meta.env.DEV) console.error('[mirror] hydrate failed —', err?.message, '\n  details:', err?.details)
        // Mode dégradé : on continue en local-only sans bloquer l'éditeur
        hydratedRef.current = true
        setError(err)
        setStatusSafe('error')
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  // ─── Diff detection : drawings ───
  // Le snapshot est mis à jour PAR-ITEM dans syncDiff (pas de rebuild ici)
  // pour rester cohérent avec la branche textBoxes qui filtre certains items.
  useEffect(() => {
    if (!documentId || !hydratedRef.current) return
    syncDiff('drawings', drawings, (d) => inferType(d, 'drawing'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, documentId])

  // ─── Diff detection : textBoxes (avec filtre style Kami) ───
  // Filtre : on NE SYNC PAS les textboxes vides (juste créées, pas de texte)
  // ni celle actuellement en cours d'édition (textarea focus). Le sync part :
  //   - au blur (currentlyEditingTextboxId redevient null/différent)
  //   - quand l'user a fini de taper et la textbox a du contenu
  // → évite des dizaines d'upserts pendant la frappe + évite de créer des
  //   rows cloud pour des textboxes jamais utilisées (clic accidentel).
  useEffect(() => {
    if (!documentId || !hydratedRef.current) return
    syncDiff('textBoxes', textBoxes, () => 'textbox', shouldSyncTextbox)
    // Snapshot mis à jour PAR-ITEM dans syncDiff. Pas de rebuild ici, sinon
    // les items skippés repasseraient en snapshot et le diff suivant les
    // verrait comme "pas de changement" → le sync au blur ne partirait jamais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textBoxes, documentId, currentlyEditingTextboxId])

  // Filtre style Kami : skip vide + skip en cours d'édition.
  function shouldSyncTextbox(b) {
    if (!b) return false
    // 1. Pas de texte → skip. Une textbox vide n'a pas de raison d'être dans
    //    le cloud (clic accidentel en mode texte, pas encore commencé à taper).
    //    On vérifie plusieurs fields possibles selon la structure (text plain,
    //    rich text, html, ou content brut).
    const fields = [b.text, b.richText, b.html, b.content]
    const hasContent = fields.some(f =>
      typeof f === 'string' ? f.trim().length > 0 : Boolean(f)
    )
    if (!hasContent) return false
    // 2. En cours d'édition → skip. Le sync partira quand l'user blur →
    //    currentlyEditingTextboxId devient null ou différent → ce useEffect
    //    re-runs (deps incluent currentlyEditingTextboxId) et le filtre passe.
    const editingId = currentlyEditingTextboxIdRef.current
    if (editingId != null && String(editingId) === String(b.id)) return false
    return true
  }

  function syncDiff(kind, next, typeFor, shouldSyncItem) {
    const lastSnapshot = lastMirroredRef.current[kind]
    // Keys en string pour matcher avec le snapshot (qui est aussi en string)
    // indépendamment du type d'id local (number vs string).
    const nextById = new Map(next.map(a => [String(a.id), a]))
    // Adds + updates
    for (const [id, item] of nextById) {
      // Filtre optionnel (textboxes : skip empty, skip currently editing).
      // Pour les items skippés, on NE TOUCHE PAS au snapshot → le prochain
      // run du diff effect (au blur) re-comparera avec l'ancien snapshot et
      // syncera enfin la version finale.
      if (shouldSyncItem && !shouldSyncItem(item)) continue
      const prev = lastSnapshot.get(id)
      if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
        scheduleUpsert({
          id: item.id, document_id: documentId,
          page_index: item.pageIndex || 0,
          type: typeFor(item),
          data: item,
          client_nonce: clientNonceRef.current,
        })
        lastSnapshot.set(id, item)
      }
    }
    // Deletes (présents avant, plus là maintenant) — critique pour que la
    // suppression d'un textbox local déclenche un remove cloud.
    // Array.from() pour éviter de muter le Map pendant l'itération.
    for (const id of Array.from(lastSnapshot.keys())) {
      if (!nextById.has(id)) {
        scheduleDelete(id)
        lastSnapshot.delete(id)
      }
    }
  }

  function scheduleUpsert(payload) {
    const id = payload.id
    const existing = pendingRef.current.get(id)
    if (existing?.timer) clearTimeout(existing.timer)
    const timer = setTimeout(() => flushOne(id), DEBOUNCE_MS)
    pendingRef.current.set(id, { timer, payload })
    setStatusSafe('syncing')
  }

  function scheduleDelete(id) {
    const pending = pendingRef.current.get(id)
    if (pending?.timer) clearTimeout(pending.timer)
    pendingRef.current.delete(id)
    setStatusSafe('syncing')
    // Hard-delete : la row est physiquement retirée. Le realtime DELETE
    // event propage la suppression aux autres clients via
    // handleRealtimeEvent (eventType='DELETE').
    remove(id)
      .then(() => {
        if (mountedRef.current && pendingRef.current.size === 0) {
          setStatusSafe('synced')
        }
      })
      .catch(err => {
        if (import.meta.env.DEV) console.error('[mirror] remove failed —', err?.message, '\n  details:', err?.details)
        setStatusSafe('error')
      })
  }

  async function flushOne(id) {
    const entry = pendingRef.current.get(id)
    if (!entry) return
    pendingRef.current.delete(id)
    try {
      await upsert(entry.payload)
      if (mountedRef.current && pendingRef.current.size === 0) {
        setStatusSafe('synced')
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[mirror] upsert failed —', err?.message, '\n  details:', err?.details)
      setStatusSafe('error')
    }
  }

  // ─── Flush avant unload ───
  useEffect(() => {
    const handler = () => {
      const ids = Array.from(pendingRef.current.keys())
      ids.forEach(flushOne)
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Phase 2 : subscription postgres_changes (cloud → local) ───
  // Écoute les events INSERT/UPDATE/DELETE sur la table annotations filtrés
  // par document_id. Applique chaque event au state local React, sauf si
  // client_nonce du row matche le nôtre (= on est l'auteur de l'event, on
  // l'a déjà appliqué via setState dans le diff/upsert local — sinon boucle).
  //
  // Reconnect (B6.a du plan) : sur chaque (re)connexion du channel après la
  // 1re, on refetch + merge pour rattraper les events ratés pendant une
  // déconnexion (typiquement onglet en background, switch réseau, sleep).
  useEffect(() => {
    if (!documentId) return
    // Topic unique par mount pour contourner un bug du client Supabase :
    // supabase.channel('doc:xyz') renvoie parfois un channel déjà souscrit
    // lors d'un re-mount (React StrictMode en dev, HMR, navigation rapide).
    // `.on('postgres_changes', ...)` plante alors avec
    //    « cannot add 'postgres_changes' callbacks for realtime:doc:… after subscribe() »
    // et fait crasher EditorInstance → page blanche.
    // Le topic n'a AUCUN impact sur la réception des events postgres_changes :
    // ils sont déclenchés par la DB via le filtre sur la table, pas par le
    // nom du topic. C'est juste un label local au client — le rendre unique
    // par mount casse la collision sans changer le comportement réseau.
    const mountNonce = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(`doc:${documentId}:${mountNonce}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'annotations',
          filter: `document_id=eq.${documentId}`,
        },
        handleRealtimeEvent,
      )
      .subscribe((subStatus) => {
        if (import.meta.env.DEV) console.log('[mirror] channel status', subStatus, 'doc:' + documentId)
        if (subStatus === 'SUBSCRIBED') {
          if (hasSubscribedOnceRef.current && hydratedRef.current) {
            refetchAndMerge()
          }
          hasSubscribedOnceRef.current = true
        }
      })
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  function handleRealtimeEvent(payload) {
    const { eventType, new: newRow, old: oldRow } = payload
    // ⚠️ Bug fix DELETE : pour un DELETE, Supabase envoie payload.new = {}
    // (objet vide) et payload.old = { id, document_id, ... } (la row supprimée
    // grâce à REPLICA IDENTITY FULL). Or `{}` est TRUTHY en JS, donc
    // `newRow || oldRow` retournait l'objet vide → row.id = undefined → on
    // ne pouvait pas filter le state local pour retirer l'item supprimé
    // (= ce qui causait le bug « delete propage pas sur l'autre compte »).
    // On force la lecture de `oldRow` pour les DELETE, ailleurs `newRow`.
    const row = eventType === 'DELETE' ? oldRow : (newRow || oldRow)
    if (import.meta.env.DEV) console.log('[mirror] event', eventType, row?.id, 'nonce=' + row?.client_nonce, 'mine=' + clientNonceRef.current)
    if (!row) return
    // Echo prevention : on ignore nos propres writes (déjà appliqués localement
    // par le diff effect avant l'upsert — si on les ré-appliquait via setState,
    // ça re-trigger le diff effect, etc.).
    if (row.client_nonce && row.client_nonce === clientNonceRef.current) {
      if (import.meta.env.DEV) console.log('[mirror] event ignored (echo)')
      return
    }
    // ⚠️ Coerce id en string : la colonne annotations.id est TEXT en DB,
    // mais les ids créés localement (Date.now()) sont des nombres. Sans cette
    // coercion, `prev.some(x => x.id === id)` rate à cause de `1234 === "1234"`
    // === false, et un doublon apparaît après chaque move.
    const id = String(row.id)
    const sameId = (x) => String(x.id) === id
    // DELETE physique OU soft-delete (UPDATE avec deleted_at not null)
    const isDelete = eventType === 'DELETE' || (eventType === 'UPDATE' && newRow?.deleted_at)
    if (isDelete) {
      // Update snapshot AVANT setState pour que le diff effect ne ne re-uploade
      // pas l'élément qu'on vient juste de retirer (sinon le snapshot contient
      // encore l'item, le state nouveau ne l'a plus, le diff voit ça comme une
      // suppression locale et appelle softDelete pour rien).
      lastMirroredRef.current.drawings.delete(id)
      lastMirroredRef.current.textBoxes.delete(id)
      setDrawingsRef.current(prev => prev.filter(d => !sameId(d)))
      setTextBoxesRef.current(prev => prev.filter(b => !sameId(b)))
      return
    }
    // INSERT ou UPDATE (non-delete). Force ann.id en string aussi pour que
    // upsertById matche correctement contre les items locaux qui pourraient
    // être restés en number (ex: Date.now() au moment de la création locale).
    const ann = { ...newRow.data, id, pageIndex: newRow.page_index }
    if (newRow.type === 'textbox') {
      // Defensive cross-array dedup : si l'annotation est aussi présente dans
      // drawings (cas où le type a changé entre 2 events, ou inferType()
      // classifie différemment selon les fields qui arrivent), on la retire
      // de drawings AVANT de l'ajouter à textBoxes pour éviter le warning
      // React `Encountered two children with the same key`.
      lastMirroredRef.current.drawings.delete(id)
      lastMirroredRef.current.textBoxes.set(id, ann)
      setDrawingsRef.current(prev => prev.some(sameId) ? prev.filter(d => !sameId(d)) : prev)
      setTextBoxesRef.current(prev => upsertById(prev, ann))
    } else {
      // Idem dans l'autre sens : retire de textBoxes avant d'ajouter à drawings.
      lastMirroredRef.current.textBoxes.delete(id)
      lastMirroredRef.current.drawings.set(id, ann)
      setTextBoxesRef.current(prev => prev.some(sameId) ? prev.filter(b => !sameId(b)) : prev)
      setDrawingsRef.current(prev => upsertById(prev, ann))
    }
  }

  async function refetchAndMerge() {
    try {
      const rows = await listForDoc(documentId)
      const cloudDrawings = []
      const cloudTextBoxes = []
      for (const r of rows) {
        const ann = { ...r.data, id: r.id, pageIndex: r.page_index }
        if (r.type === 'textbox') cloudTextBoxes.push(ann)
        else cloudDrawings.push(ann)
      }
      // pendingIds = ids qu'on a localement mais pas encore flush sur le cloud.
      // On les conserve dans le merge pour pas les perdre à la reconnexion.
      const pendingIds = new Set(Array.from(pendingRef.current.keys(), String))
      lastMirroredRef.current.drawings = new Map(cloudDrawings.map(d => [String(d.id), d]))
      lastMirroredRef.current.textBoxes = new Map(cloudTextBoxes.map(b => [String(b.id), b]))
      setDrawingsRef.current(prev => mergeWithCloud(prev, cloudDrawings, pendingIds))
      setTextBoxesRef.current(prev => mergeWithCloud(prev, cloudTextBoxes, pendingIds))
      setStatusSafe('synced')
    } catch (err) {
      if (import.meta.env.DEV) console.error('[mirror] refetchAndMerge failed —', err?.message, '\n  details:', err?.details)
    }
  }

  return { status, error }
}

/**
 * Upsert un item par id dans un array (ajoute s'il n'existe pas, remplace
 * sinon). Renvoie un nouveau array (immutable, compatible React state).
 */
function upsertById(arr, item) {
  // Coerce les deux côtés en string pour matcher même si l'item local a
  // un id numérique (Date.now()) et l'item entrant un id texte (colonne TEXT).
  const targetId = String(item.id)
  const idx = arr.findIndex(x => String(x.id) === targetId)
  if (idx === -1) return [...arr, item]
  const next = arr.slice()
  next[idx] = item
  return next
}

/**
 * Merge cloud rows dans un local array (utilisé au refetch sur reconnect) :
 * - Les rows présents côté cloud remplacent leur version locale (ground truth)
 * - Les rows locaux qui sont dans pendingIds sont préservés (pas encore flush)
 * - Les autres rows locaux (étaient sur le cloud, plus là maintenant) sont
 *   retirés (= soft-deleted ailleurs pendant qu'on était déconnecté).
 */
function mergeWithCloud(local, cloudRows, pendingIds) {
  // Tout en string pour matcher même si l'item local est numérique
  // (Date.now()) et l'item cloud texte (colonne TEXT).
  const cloudById = new Map(cloudRows.map(r => [String(r.id), r]))
  const next = []
  for (const item of local) {
    const sid = String(item.id)
    if (cloudById.has(sid)) continue // remplacé par version cloud ci-dessous
    if (pendingIds.has(sid)) next.push(item) // pending local, pas encore flush
    // else: drop (soft-deleted ailleurs)
  }
  for (const r of cloudRows) next.push(r)
  return next
}

/**
 * Infère le type Postgres d'une annotation depuis sa structure JS.
 * Heuristique simple — à raffiner si la structure des drawings change.
 * Si rien ne match, retourne le `fallback` (typiquement 'drawing').
 */
function inferType(annotation, fallback) {
  if (!annotation) return fallback
  if (annotation.kind === 'image' || annotation.imageId || annotation.imageUrl) return 'image'
  if (annotation.kind === 'comment' || annotation.isComment) return 'comment'
  if (annotation.kind === 'signature' || annotation.isSignature) return 'signature'
  if (annotation.kind === 'shape' || annotation.shape || annotation.rect || annotation.ellipse) return 'shape'
  return fallback
}