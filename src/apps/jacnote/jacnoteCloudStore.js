// jacnoteCloudStore.js
// Petit store Zustand qui expose l'état de synchronisation cloud de JacNote :
//   - enabled       : booléen, true dès qu'une session Supabase existe
//   - status        : 'idle' | 'syncing' | 'synced' | 'error' | 'disconnected'
//   - lastSyncedAt  : ISO string, mise à jour à chaque flush réussi
//   - error         : dernier message d'erreur (null si OK)
//   - stats         : { noteCount, folderCount } pour CloudSection
//
// Le hook useJacNoteCloud pilote ce store. La sidebar (futur indicateur)
// et CloudSection.jsx s'abonnent en lecture seule.

import { create } from 'zustand'

export const useJacNoteCloudStore = create((set) => ({
	enabled: false,
	status: 'idle',
	lastSyncedAt: null,
	error: null,
	stats: null,

	setEnabled: (v) => set({ enabled: !!v }),
	setStatus: (s) => set({ status: s }),
	setLastSyncedAt: (ts) => set({ lastSyncedAt: ts }),
	setError: (e) => set({ error: e ?? null }),
	setStats: (s) => set({ stats: s }),
}))