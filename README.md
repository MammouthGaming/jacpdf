# JacSuite

Suite d'applications React + Vite + Supabase. Chaque app vit dans son propre dossier sous `src/apps/`, le code partagé vit dans `src/shared/`, et le launcher 4 apps (écran d'accueil) vit dans `src/launcher/`.

## Apps

Les numéros de version et notes de release sont centralisés dans `src/shared/components/modals/settings/shared/appChangelogs.js` — source de vérité unique lue par toutes les sections « À propos » et par VersionModal.

| Slug | Nom | Statut |
|---|---|---|
| `jacsuite` | JacSuite | ✅ v1.0 — launcher + paramètres unifiés |
| `jacpdf` | JacPDF | ✅ v1.0 — lecture / annotation / organisation de PDF |
| `jacdoc` | JacDoc | ✅ v1.0 — édition de documents |
| `jactache` | JacTâche | ✅ v1.0 — listes de tâches et projets |
| `jaccalendrier` | JacCalendrier | ✅ v1.0 — agenda et événements |
| `jacnote` | JacNote | ✅ v1.0 — notes rapides avec sync cloud |
| `jacslide` | JacSlide | 🚧 Bientôt — présentations |
| `jacpaint` | JacPaint | 🅰️ v0.1 — accueil et gestion d'onglets (éditeur à venir) |

## Stack

- **Frontend** : React 19, Vite 8, React Router 7
- **Backend** : Supabase (auth, Postgres, Storage, Realtime, Edge Functions)
- **PDF** : pdfjs-dist, pdf-lib, react-pdf, jspdf
- **Local-first** : IndexedDB pour le cache, localStorage pour les préférences

## Structure

- `src/apps/` — 1 dossier par app
    - `jacpdf/` — JacPDF (home, editor, viewer, components, hooks PDF)
    - `jacdoc/` — JacDoc (home, editor ProseMirror, miroir cloud)
    - `jactache/` — JacTâche (sidebar, liste, détail, sync cloud)
    - `jaccalendrier/` — JacCalendrier (vue mois, calendriers multiples)
    - `jacnote/` — JacNote (sidebar, éditeur Tiptap, sync cloud)
    - `jacslide/` — placeholder « Bientôt »
    - `jacpaint/` — JacPaint (accueil, store local, onglets — éditeur à venir)
- `src/shared/` — code partagé entre toutes les apps
    - `components/` — Settings, EditSidebar, modals universels
    - `hooks/` — useAuth, useNotifications, useLauncher
    - `lib/` — supabase, infra, user roles
    - `stores/` — launcherStore, socialEnabledStore
- `src/launcher/` — écran d'accueil (JacLauncher.jsx)
- `src/auth/` — Login, signup
- `src/App.jsx`, `src/App.css`, `src/main.jsx`, `src/index.css`

## Aliases

Un seul alias Vite : `@/` → `./src/`. Les chemins typiques :

- `@/apps/jacpdf/...`
- `@/shared/hooks/system/useAuth`
- `@/launcher/JacLauncher`

## Scripts

- `npm run dev` — serveur de dev Vite + HMR
- `npm run build` — build production
- `npm run preview` — preview du build
- `npm run lint` — ESLint