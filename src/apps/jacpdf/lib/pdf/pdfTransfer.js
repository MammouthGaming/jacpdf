// Persistance multi-onglets dans IndexedDB.
//
// Source de vérité pour le refresh (F5) — sessionStorage plafonne à ~5 Mo,
// IndexedDB n'a pas cette limite.
//
// Schéma split (Lot 7 — étape G) :
//   - KEY_MANIFEST = 'tabs-manifest' : métadonnées des onglets ouverts
//     (id, type, fileName, groupId) + activeId. Léger → écrit à chaque save.
//     type supporte home, pdf et classroom (onglet JacPDF Classroom).
//   - KEY_BYTES_PREFIX + tabId : Uint8Array du PDF de cet onglet, stocké
//     sous SA propre clé. Écrit UNE FOIS au load d'un PDF, jamais ré-écrit
//     pour de simples changements de liste d'onglets (fermeture, réorder,
//     activation). Diff par référence d'octets pour skipper les puts inutiles.
//
// Avantage : fermer un onglet ne ré-écrit plus les bytes des onglets restants.
// Sans ce split, fermer 1 onglet sur 4 forçait IDB à structured-cloner ~75 Mo
// de Uint8Array sur le thread principal → lag visible. Maintenant : 1 delete
// cheap + 1 manifest write (quelques Ko).
//
// Les clés legacy 'current' (single-tab) et 'tabs' (multi-tab inline-bytes)
// sont gardées comme fallbacks de récupération pour les sessions antérieures
// au split. La 1re écriture après un load legacy migre vers le schéma split.

import { performanceStore } from "@/shared/stores/system/performanceStore"
import { toastStore } from "@/shared/stores/ui/toastStore"

const DB_NAME = 'jacpdf'
const STORE = 'pdf'
const KEY_LEGACY = 'current'
const KEY_TABS_LEGACY = 'tabs'  // legacy multi-tab format (bytes inline)
const KEY_MANIFEST = 'tabs-manifest'  // métadonnées seulement
const KEY_BYTES_PREFIX = 'tab-bytes:'

// Cache des références d'octets DÉJÀ persistées en IDB pour cette session.
// saveTabs compare la ref courante de tab.fileBytes à celle stockée ici :
// si identique → skip le put (pas besoin de re-cloner). Module-level → reset
// au prochain reload (le module est ré-évalué).
const bytesWrittenById = new Map()

// Migration legacy → split. Une fois clearé, on ne re-tente pas à chaque save.
let legacyTabsCleared = false

// Lot 7 — étape F : warning IDB-quota-atteinte ne s'affiche qu'une fois par
// session pour ne pas spammer l'utilisateur à chaque saveTabs.
let overLimitWarned = false

// Somme des bytes actuellement persistés en IDB (pour cette session).
// Utilise bytesWrittenById, qui est notre cache local des refs déjà écrites
// → pas besoin de re-scanner IDB à chaque save.
const totalBytesPersisted = () => {
  let total = 0
  for (const arr of bytesWrittenById.values()) {
    total += arr?.byteLength || 0
  }
  return total
}

// Avertit l'utilisateur que la limite IDB a été atteinte. Une seule fois
// par session pour ne pas spammer.
const warnOverLimit = (currentMb, limitMb) => {
  if (overLimitWarned) return
  overLimitWarned = true
  const fn = toastStore.warning || toastStore.info || toastStore.success
  fn?.(`💾 Limite stockage atteinte (${currentMb.toFixed(0)}/${limitMb} Mo). Nouveaux PDFs gardés en mémoire seulement — perdus au refresh.`)
}

// Ouvre la base IDB (lazy, schéma v1 avec un seul object store).
const openDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1)
  req.onupgradeneeded = () => {
    const db = req.result
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const idbPut = (value, key) => openDb().then(db => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(value, key)
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
}))

const idbGet = (key) => openDb().then(db => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).get(key)
  req.onsuccess = () => resolve(req.result || null)
  req.onerror = () => reject(req.error)
}))

const idbClear = (key) => openDb().then(db => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(key)
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
}))

// Sauvegarde la session multi-onglets (manifest + bytes par onglet).
// Diff par référence : on ne ré-écrit les bytes d'un onglet que si sa ref
// fileBytes a changé depuis la dernière écriture (= nouveau PDF chargé).
// Fermer ou réordonner des onglets ne touche QUE le manifest + delete des
// clés bytes des onglets fermés.
export const saveTabs = async (tabs, activeId) => {
  const persistable = (tabs || []).filter(t => {
    if (!t) return false
    const type = t.type || 'pdf'  // rétro-compat anciennes sessions
    if (type === 'home' || type === 'classroom') return true
    return !!t.fileBytes
  })
  try {
    if (persistable.length === 0) {
      // Liste vide → vide manifest + tous les bytes connus de cette session.
      await idbClear(KEY_MANIFEST)
      for (const id of [...bytesWrittenById.keys()]) {
        await idbClear(KEY_BYTES_PREFIX + id).catch(() => {})
      }
      bytesWrittenById.clear()
      return
    }
    const liveIds = new Set(persistable.map(t => t.id))
    // Lot 7 — étape F : budget IDB. Si idbSizeLimitMb est défini (≠ Infinity)
    // ET sessionOnlyOverLimit=true, on skip les puts qui feraient dépasser
    // la limite. Les bytes restent en mémoire (dans tabsCache de Editor) mais
    // ne survivront pas au refresh. sessionOnlyOverLimit=false → best-effort,
    // on persiste quand même (le navigateur peut quand même nous bouncer si
    // le quota navigateur est atteint, mais c'est sa propre limite).
    const settings = performanceStore.get()
    const idbLimitMb = settings.idbSizeLimitMb
    const sessionOnly = settings.sessionOnlyOverLimit
    const idbLimitBytes = Number.isFinite(idbLimitMb) ? idbLimitMb * 1024 * 1024 : Infinity
    // 1) Bytes : écrit seulement les onglets dont la ref a changé / est nouvelle.
    for (const t of persistable) {
      const type = t.type || 'pdf'
      if (type !== 'pdf' || !t.fileBytes) continue
      const prev = bytesWrittenById.get(t.id)
      if (prev !== t.fileBytes) {
        // Check budget AVANT le put. delta = nouvelle taille - ancienne (0 si
        // pas d'ancienne entrée). Permet de remplacer un PDF par un plus
        // petit sans déclencher la limite faussement.
        if (Number.isFinite(idbLimitBytes)) {
          const delta = t.fileBytes.byteLength - (prev?.byteLength || 0)
          const projected = totalBytesPersisted() + delta
          if (projected > idbLimitBytes && sessionOnly) {
            warnOverLimit(projected / (1024 * 1024), idbLimitMb)
            continue
          }
        }
        await idbPut(t.fileBytes, KEY_BYTES_PREFIX + t.id)
        bytesWrittenById.set(t.id, t.fileBytes)
      }
    }
    // 2) Bytes : supprime les onglets qui ne sont plus dans la liste.
    for (const id of [...bytesWrittenById.keys()]) {
      if (!liveIds.has(id)) {
        await idbClear(KEY_BYTES_PREFIX + id).catch(() => {})
        bytesWrittenById.delete(id)
      }
    }
    // 3) Manifest (léger — métadonnées sans Uint8Array).
    const manifest = {
      tabs: persistable.map(t => ({
        id: t.id,
        type: t.type || 'pdf',
        fileName: t.fileName,
        groupId: t.groupId,
        // fileId Drive (mode hybride 3C) — sans ça, l'ID Drive est perdu
        // au prochain saveTabs (500 ms plus tard) ou au refresh, et l'onglet
        // retombe en source 'local' alors qu'il vient de Drive. Préservé
        // tel quel dans le manifest (léger, juste un string).
        fileId: t.fileId,
        // jacpdfCloudId — même logique que fileId, mais pour le service
        // maison JacPDF Cloud (Supabase). Sans ça, au refresh l'onglet
        // perd son association cloud, le badge passe à « Ordinateur »
        // et l'auto-save JacPDF Cloud bail-out (gate `!jacpdfCloudId`).
        jacpdfCloudId: t.jacpdfCloudId,
      })),
      activeId,
    }
    await idbPut(manifest, KEY_MANIFEST)
    // 4) Migration : purge l'ancienne clé 'tabs' (bytes inline) une fois
    // qu'on a écrit le nouveau format. Ne tente qu'une fois par session.
    if (!legacyTabsCleared) {
      idbClear(KEY_TABS_LEGACY).catch(() => {})
      legacyTabsCleared = true
    }
  } catch {}
}

// Écrit directement les bytes d'un onglet en IDB sans passer par saveTabs.
// Appelé après un auto-save cloud réussi : les bytes uploadés contiennent
// déjà /JacPDFMeta + /Annot à jour, on les recopie dans IDB pour qu'au
// prochain refresh, le tab soit restauré avec les annotations finales
// au lieu des bytes ORIGINAUX téléchargés à l'ouverture (qui ont l'ancienne
// meta → readJacPdfMeta rehydrate les anciennes positions).
//
// ⚠️ Ne touche PAS à bytesWrittenById. La ref `t.fileBytes` côté React
// reste celle de l'origine (= initialBytes au moment de l'ouverture). Si on
// mettait bytesWrittenById.set(tabId, newBytes), au prochain saveTabs
// (debounce 500ms déclenché par n'importe quel changement), prev=newBytes
// vs t.fileBytes=oldRef → diff → re-write oldRef en IDB → REVERT instantané.
// En laissant bytesWrittenById sur oldRef : prev=oldRef === t.fileBytes=oldRef
// → skip → IDB garde nos newBytes ✓.
export const saveTabBytes = async (tabId, bytes) => {
  if (!tabId || !bytes) return
  try {
    await idbPut(bytes, KEY_BYTES_PREFIX + tabId)
  } catch {}
}

// Restaure la session multi-onglets. Tente d'abord le schéma split (manifest
// + bytes par onglet) ; à défaut, retombe sur le format legacy 'tabs' avec
// bytes inline. Les bytes manquants pour un onglet PDF du manifest font
// drop l'onglet (cas rare : delete partiel de la base).
export const loadTabs = async () => {
  try {
    const manifest = await idbGet(KEY_MANIFEST)
    if (manifest?.tabs?.length) {
      const tabs = []
      for (const m of manifest.tabs) {
        const type = m.type || 'pdf'
        if (type === 'home' || type === 'classroom') {
          tabs.push({ id: m.id, type })
          continue
        }
        const bytes = await idbGet(KEY_BYTES_PREFIX + m.id)
        if (!bytes) continue  // bytes manquants → drop l'onglet
        tabs.push({
          id: m.id,
          type: 'pdf',
          fileName: m.fileName,
          fileBytes: bytes,
          groupId: m.groupId,
          fileId: m.fileId,
          jacpdfCloudId: m.jacpdfCloudId,
        })
        // Marque cette ref comme « déjà persistée » → le prochain saveTabs
        // n'aura pas à ré-écrire ces bytes (économise un put de chaque PDF
        // au boot).
        bytesWrittenById.set(m.id, bytes)
      }
      return { tabs, activeId: manifest.activeId }
    }
    // Fallback legacy : ancien format avec bytes inline. La 1re écriture
    // saveTabs migrera vers le schéma split (et clearera KEY_TABS_LEGACY).
    // On ne pré-remplit PAS bytesWrittenById ici — il faut que saveTabs
    // détecte les bytes comme « pas encore persistés au nouveau schéma »
    // pour les écrire sous KEY_BYTES_PREFIX.
    const legacy = await idbGet(KEY_TABS_LEGACY)
    if (!legacy?.tabs) return null
    return {
      ...legacy,
      tabs: legacy.tabs.map(t => ({ ...t, type: t.type || 'pdf' })),
    }
  } catch {
    return null
  }
}

// Fallback legacy : lit le dernier PDF transféré (clé 'current'). Couvre
// les sessions antérieures à la persistance multi-onglets. Renvoie null si
// rien en base ou si IDB n'est pas dispo (mode privé, quota épuisé, etc.).
export const loadPersistedPdf = async () => {
  try {
    return await idbGet(KEY_LEGACY)
  } catch {
    return null
  }
}

// Vide la persistance legacy (non utilisé pour l'instant — on garde toujours
// le dernier PDF dispo au prochain refresh).
export const clearPersistedPdf = async () => {
  try { await idbClear(KEY_LEGACY) } catch (err) {}
}