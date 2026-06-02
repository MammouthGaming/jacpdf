// Store des groupes d'onglets — collection NOMMÉE d'onglets que l'utilisateur
// peut sauvegarder pour rouvrir tous d'un coup depuis la page d'Accueil
// (façon « sessions » de Chrome).
//
// Promu de `src/apps/jacpdf/stores/system/` vers `src/shared/stores/system/`
// en Phase 1 du refactor multi-apps JacSuite : les groupes d'onglets sont
// partagés par toutes les apps (JacPDF / JacDoc / JacNote) via le shell global.
//
// ⚠️ Pour l'instant, persistance en MÉMOIRE UNIQUEMENT — les groupes
// survivent aux changements d'onglets et de pages, mais PAS au refresh.
// Quand Supabase sera branché, le corps de ces fonctions passera à une
// table `tab_groups`. L'API publique (getAll / create / remove /
// subscribe) reste la même côté React → migration sans toucher aux UI.

let groups = []  // [{ id, name, createdAt, tabs: [{ fileName, fileBytes }] }]
const listeners = []

function notify() {
  listeners.forEach(fn => fn(groups))
}

export const tabGroupsStore = {
  // Toujours retourné trié par date décroissante — le plus récent en haut
  // de la liste sur l'Accueil.
  getAll() {
    return [...groups].sort((a, b) => b.createdAt - a.createdAt)
  },

  // tabs = [{ fileName, fileBytes: Uint8Array }]. Les bytes sont CLONÉS
  // pour découpler le groupe de l'onglet d'origine — sinon, modifier un
  // PDF dans l'onglet actif altérerait le groupe sauvegardé (Uint8Array
  // partage le buffer sous-jacent par défaut).
  create(name, tabs) {
    const cloned = (tabs || [])
      .filter(t => t && t.fileBytes && t.fileBytes.length > 0)
      .map(t => ({
        fileName: t.fileName || 'Document.pdf',
        fileBytes: new Uint8Array(t.fileBytes),
      }))
    if (cloned.length === 0) return null
    const fallback = `Groupe du ${new Date().toLocaleDateString('fr-CA')}`
    const group = {
      id: 'grp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: ((name || '').trim()) || fallback,
      createdAt: Date.now(),
      tabs: cloned,
    }
    groups = [group, ...groups]
    notify()
    return group
  },

  remove(id) {
    const before = groups.length
    groups = groups.filter(g => g.id !== id)
    if (groups.length !== before) notify()
  },

  clear() {
    if (groups.length === 0) return
    groups = []
    notify()
  },

  subscribe(fn) {
    listeners.push(fn)
    return () => {
      const i = listeners.indexOf(fn)
      if (i !== -1) listeners.splice(i, 1)
    }
  },
}