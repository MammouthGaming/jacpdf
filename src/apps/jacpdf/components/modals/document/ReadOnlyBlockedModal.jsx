// src/components/modals/document/ReadOnlyBlockedModal.jsx
// Modal style Kami — s'affiche quand un viewer ou commenter tente une
// action d'édition non permise (texte, dessin, formes, image, eraser, ou
// commentaire pour viewer). Propose deux issues : Annuler (ferme et reste
// en lecture/commentaire) ou Créer une copie (duplique le PDF dans le
// JacPDF Cloud du user — il en devient owner et a tous les droits dessus).
//
// L'idée Kami : ne PAS masquer les boutons de la toolbar (l'utilisateur
// peut explorer ce qui existe), mais bloquer les actions destructives au
// moment du commit avec un rappel clair de ses permissions et un chemin
// d'évasion (la copie modifiable).
//
// Style inline : on évite l'injection CSS module-level (cf. session 7 mai
// 2026 où l'injection CSS-in-JS dynamique a causé du flap de re-render).

import { useEffect } from 'react'

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 10000, fontFamily: 'Inter, sans-serif',
}

const modalStyle = {
  background: '#1a1d29', color: '#e5e7eb', borderRadius: 12,
  padding: '32px 36px', width: 'min(460px, 90vw)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid #2a3347',
  textAlign: 'center',
}

const iconStyle = {
  width: 56, height: 56, margin: '0 auto 16px',
  borderRadius: '50%', background: 'rgba(251, 191, 36, 0.15)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 28,
}

const titleStyle = { margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: '#fff' }
const messageStyle = { margin: '0 0 24px', fontSize: 14, lineHeight: 1.5, color: '#9ca3af' }
const actionsStyle = { display: 'flex', gap: 12, justifyContent: 'center' }

const btnBase = {
  padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
  transition: 'background 0.15s, opacity 0.15s',
}

const btnSecondary = {
  ...btnBase,
  background: 'transparent', color: '#9ca3af', border: '1px solid #2a3347',
}

const btnPrimary = {
  ...btnBase,
  background: 'var(--accent, #39FF14)', color: '#000',
}

export default function ReadOnlyBlockedModal({
  // Rôle du user courant — 'viewer' / 'commenter' / 'editor'. Pour le rare
  // cas de l'editor, le modal s'ouvre uniquement quand feature==='editOthers'
  // (le propriétaire a révoqué cette permission via les réglages collab) —
  // dans ce mode on n'affiche PAS le CTA « Créer une copie » : l'editor a
  // déjà accès en édition au doc, juste pas le droit de toucher aux
  // annotations existantes des autres. Un simple « Fermer » suffit.
  role,
  // Clé de la feature qui a déclenché le blocage (ex. 'text', 'pencil',
  // 'images', 'comments', 'move', 'editOthers'). Utilisée pour choisir le
  // titre/message/actions appropriés. 'editOthers' a un parcours dédié.
  feature,
  // true si une session JacPDF Cloud est active. Si false, le bouton
  // « Créer une copie » est grisé avec un title explicatif.
  cloudConnected,
  // true pendant l'upload de la copie — désactive les deux boutons et
  // change le label du bouton primaire en « Création… ».
  busy,
  onClose,
  onCreateCopy,
}) {
  // Échap pour fermer (UX standard des modals).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Mode « modification d'annotations d'autres révoquée » — simple notice avec
  // un bouton Fermer. Pas de « Créer une copie » : l'editor peut déjà
  // éditer le doc partagé (juste pas les annotations existantes), donc une
  // copie n'a pas de sens ici.
  if (feature === 'editOthers') {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <div style={iconStyle}>🔒</div>
          <h2 style={titleStyle}>Modification non autorisée</h2>
          <p style={messageStyle}>
            Le propriétaire a enlevé l'accès à l'édition des annotations
            d'autres personnes. Tu peux toujours créer tes propres
            annotations, mais pas modifier ni supprimer celles qui existent
            déjà.
          </p>
          <div style={actionsStyle}>
            <button
              style={ { ...btnPrimary, opacity: 1, cursor: 'pointer' } }
              onClick={onClose}
              autoFocus
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    )
  }

  const message = role === 'viewer'
    ? "Tu consultes ce document en lecture seule. Pour modifier ou annoter, demande l'accès en édition au propriétaire, ou crée une copie modifiable dans ton JacPDF Cloud."
    : "Tu peux uniquement ajouter des commentaires sur ce document. Pour utiliser les autres outils (texte, dessin, formes…), demande l'accès en édition, ou crée une copie modifiable."

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={iconStyle}>🔒</div>
        <h2 style={titleStyle}>
          {role === 'viewer' ? 'Document en lecture seule' : 'Commentaires uniquement'}
        </h2>
        <p style={messageStyle}>{message}</p>
        <div style={actionsStyle}>
          <button style={btnSecondary} onClick={onClose} disabled={busy}>
            Annuler
          </button>
          {cloudConnected ? (
            <button
              style={ { ...btnPrimary, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' } }
              onClick={onCreateCopy}
              disabled={busy}
            >
              {busy ? 'Création…' : 'Créer une copie'}
            </button>
          ) : (
            <button
              style={ { ...btnPrimary, opacity: 0.5, cursor: 'not-allowed' } }
              disabled
              title="Connecte-toi à JacPDF Cloud pour créer une copie"
            >
              Créer une copie
            </button>
          )}
        </div>
      </div>
    </div>
  )
}