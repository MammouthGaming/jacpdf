import { useEffect, useState } from 'react'
import { themeStore } from '@/shared/stores/ui/themeStore'
import { densityStore } from '@/shared/stores/ui/densityStore'

export default function ApparenceSection() {
  // Thème — store partagé ('Sombre' | 'Clair' | 'Auto'). Pose data-theme sur
  // <html> et gère l'écoute prefers-color-scheme en mode Auto.
  const [theme, setTheme] = useState(() => themeStore.get())
  useEffect(() => themeStore.subscribe(setTheme), [])

  // Densité de l'interface — store partagé. Pose data-density sur <html>
  // ('compact' | 'comfortable') ; index.css ajuste alors les variables
  // d'espacement (--space-*) et la taille de base de la typo.
  const [density, setDensity] = useState(() => densityStore.get())
  useEffect(() => densityStore.subscribe(setDensity), [])

  // Barre d'onglets JacPDF — déplacée depuis JacPDF/Apparence. On conserve
  // la même clé localStorage ('jacpdf_showTabBar') et l'event
  // 'jacpdf_settingsChange' pour que l'éditeur JacPDF continue de réagir
  // en live, sans toucher à sa logique.
  const [showTabBar, setShowTabBar] = useState(() =>
    localStorage.getItem('jacpdf_showTabBar') !== 'false'
  )
  useEffect(() => {
    const onChange = () => {
      setShowTabBar(localStorage.getItem('jacpdf_showTabBar') !== 'false')
    }
    window.addEventListener('jacpdf_settingsChange', onChange)
    return () => window.removeEventListener('jacpdf_settingsChange', onChange)
  }, [])

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Apparence</h3>
      <p className="fsm-section-sub">Thème et personnalisation visuelle globale de JacSuite.</p>

      <div className="fsm-field">
        <label className="fsm-label">Thème</label>
        <div className="fsm-theme-row">
          {[
            { id: 'Auto', label: 'Système' },
            { id: 'Clair', label: 'Clair' },
            { id: 'Sombre', label: 'Sombre' },
          ].map((t) => (
            <button
              key={t.id}
              className={`fsm-theme-btn ${theme === t.id ? 'active' : ''}`}
              onClick={() => themeStore.set(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Couleur d'accent</label>
        <p className="fsm-label-sub">
          L'accent s'adapte automatiquement à l'app active : chaque app JacSuite
          possède sa propre couleur dérivée de son logo. Elle n'est plus modifiable.
        </p>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-field">
        <label className="fsm-label">Densité de l'interface</label>
        <div className="fsm-theme-row">
          {[
            { id: 'compact', label: 'Compact' },
            { id: 'comfortable', label: 'Confortable' },
          ].map((d) => (
            <button
              key={d.id}
              className={`fsm-theme-btn ${density === d.id ? 'active' : ''}`}
              onClick={() => densityStore.set(d.id)}
            >
              <span>{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="fsm-divider" />

      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Barre d'onglets JacPDF</label>
          <p className="fsm-label-sub">Afficher la barre d'onglets en haut de l'éditeur JacPDF.</p>
        </div>
        <button
          className={`fsm-toggle ${showTabBar ? 'on' : ''}`}
          onClick={() => {
            const next = !showTabBar
            setShowTabBar(next)
            localStorage.setItem('jacpdf_showTabBar', String(next))
            // L'éditeur JacPDF écoute cet event pour se synchroniser en live.
            window.dispatchEvent(new Event('jacpdf_settingsChange'))
          }}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}