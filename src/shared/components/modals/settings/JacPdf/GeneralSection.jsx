import { useState } from 'react'
import '../FullSettingsModal.css'

// Section « Général » de la modale Paramètres.
// Affiche les préférences générales de l'application :
//  - sélecteur de langue (porté par le parent FullSettingsModal qui le persiste)
//  - toggle « Résultat automatique » (style Apple Notes) — quand activé,
//    une expression mathématique tapée dans une zone de texte (ex. « 2+3= »)
//    affiche directement la réponse. Persisté en localStorage sous la clé
//    `jacpdf_autoCalcEnabled` et broadcasté via `jacpdf_settingsChange`
//    pour que les éditeurs ouverts se synchronisent en live (même pattern
//    que les autres réglages de l'app, ex. commentsEdgeHover).
export default function GeneralSection() {
  const [autoCalc, setAutoCalc] = useState(() =>
    localStorage.getItem('jacpdf_autoCalcEnabled') === 'true'
  )

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Général</h3>
      <p className="fsm-section-sub">Préférences propres à JacPDF</p>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Résultat automatique</label>
          <p className="fsm-label-sub">
            Lorsque cette option est activée, si vous écrivez un calcul dans
            une zone de texte (ex. « 2+3= »), la réponse s'affichera
            automatiquement — comme dans Apple Notes.
          </p>
        </div>
        <button
          className={`fsm-toggle ${autoCalc ? 'on' : ''}`}
          onClick={() => {
            const next = !autoCalc
            setAutoCalc(next)
            localStorage.setItem('jacpdf_autoCalcEnabled', String(next))
            // Les éditeurs ouverts écoutent cet event pour relire le réglage.
            window.dispatchEvent(new Event('jacpdf_settingsChange'))
          }}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}