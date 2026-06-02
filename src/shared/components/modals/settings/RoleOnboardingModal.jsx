import { useEffect, useState } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { toastStore } from '@/shared/stores/ui/toastStore'
import { supabase } from '@/shared/lib/infra/supabase'

// Rôles principaux — étape 1.
const MAIN_ROLES = [
  { id: 'personnel', icon: '🏠', label: 'Personnel', desc: 'Documents personnels du quotidien' },
  { id: 'travail',   icon: '💼', label: 'Travail',   desc: 'Pro, contrats, rapports' },
  { id: 'ecole',     icon: '🎓', label: 'École',     desc: 'Études, cours, devoirs' },
  { id: 'autre',     icon: '✨', label: 'Autre',     desc: 'Décris ton usage' },
]

// Sous-rôles école — étape 2 (uniquement si role === 'ecole').
const SCHOOL_ROLES = [
  { id: 'enseignant', icon: '👨‍🏫', label: 'Enseignant', desc: 'Je donne des cours' },
  { id: 'eleve',      icon: '🎒',  label: 'Élève',      desc: "J'étudie" },
  { id: 'autre',      icon: '✨',  label: 'Autre',      desc: 'Précise ton rôle' },
]

const STYLES = `
  .rom-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex; align-items: center; justify-content: center;
    z-index: 1200;
    padding: 24px;
    animation: rom-overlay-in 0.2s ease;
    backdrop-filter: blur(4px);
  }
  @keyframes rom-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .rom-card {
    position: relative;
    background: #1a1f2e;
    border: 1px solid #2a3347;
    border-radius: 18px;
    width: 100%; max-width: 560px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 36px 32px 28px;
    display: flex; flex-direction: column;
    gap: 22px;
    color: #e5e7eb;
    font-family: 'Inter', sans-serif;
    animation: rom-card-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes rom-card-in {
    from { opacity: 0; transform: translateY(20px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  [data-theme="light"] .rom-card {
    background: #ffffff;
    border-color: #e5e7eb;
    color: #0d1117;
  }
  .rom-close {
    position: absolute;
    top: 14px;
    right: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: none; color: inherit;
    font-size: 14px; cursor: pointer;
    width: 28px; height: 28px;
    border-radius: 50%; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
  }
  .rom-close:hover { background: rgba(255, 255, 255, 0.12); }
  [data-theme="light"] .rom-close {
    background: rgba(0, 0, 0, 0.04);
  }
  [data-theme="light"] .rom-close:hover {
    background: rgba(0, 0, 0, 0.1);
  }
  .rom-stepper {
    display: flex; align-items: center; gap: 8px;
    align-self: center;
    margin-top: 4px;
  }
  .rom-step-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #2a3347;
    transition: background 0.25s, transform 0.25s;
  }
  .rom-step-dot.active {
    background: var(--accent, #39FF14);
    transform: scale(1.25);
  }
  .rom-step-dot.skipped { background: rgba(42, 51, 71, 0.3); }
  .rom-step-line {
    width: 32px; height: 2px;
    background: #2a3347;
  }
  .rom-header {
    display: flex; flex-direction: column;
    gap: 6px;
    text-align: center;
  }
  .rom-title {
    font-size: 22px; font-weight: 700; margin: 0;
    line-height: 1.3;
  }
  .rom-subtitle {
    font-size: 14px; color: #9ca3af; margin: 0;
    line-height: 1.4;
  }
  .rom-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }
  .rom-role-card {
    background: rgba(255, 255, 255, 0.02);
    border: 2px solid #2a3347;
    border-radius: 12px;
    padding: 18px 14px;
    display: flex; flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: border-color 0.18s, background 0.18s, transform 0.12s;
    font-family: inherit;
    color: inherit;
    text-align: center;
    min-height: 120px;
  }
  [data-theme="light"] .rom-role-card {
    background: #fafafa;
    border-color: #e5e7eb;
  }
  .rom-role-card:hover {
    border-color: #4b5563;
    transform: translateY(-1px);
  }
  .rom-role-card.active {
    border-color: var(--accent, #39FF14);
    background: rgba(var(--accent-rgb, 57, 255, 20), 0.10);
    box-shadow: 0 0 0 4px rgba(var(--accent-rgb, 57, 255, 20), 0.08);
  }
  .rom-role-icon {
    font-size: 28px;
    line-height: 1;
    margin-bottom: 4px;
  }
  .rom-role-label {
    font-size: 14px; font-weight: 600;
  }
  .rom-role-desc {
    font-size: 11px; color: #9ca3af;
    line-height: 1.4;
  }
  [data-theme="light"] .rom-role-desc { color: #6b7280; }
  .rom-input {
    width: 100%;
    background: #1e2535;
    border: 1px solid var(--accent, #39FF14);
    border-radius: 10px;
    padding: 12px 14px;
    color: inherit;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    animation: rom-input-in 0.2s ease;
  }
  @keyframes rom-input-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  [data-theme="light"] .rom-input { background: #ffffff; }
  .rom-actions {
    display: flex; gap: 10px;
    margin-top: 4px;
  }
  .rom-primary-btn {
    flex: 1;
    background: var(--accent, #39FF14);
    border: none;
    border-radius: 10px;
    padding: 14px;
    color: #000;
    font-size: 14px; font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.18s, transform 0.1s;
  }
  .rom-primary-btn:hover:not(:disabled) {
    background: var(--accent-hover, #2ed90d);
  }
  .rom-primary-btn:active:not(:disabled) { transform: scale(0.98); }
  .rom-primary-btn:disabled {
    background: #2a3347;
    color: #6b7280;
    cursor: not-allowed;
  }
  [data-theme="light"] .rom-primary-btn:disabled {
    background: #e5e7eb;
    color: #9ca3af;
  }
  .rom-secondary-btn {
    background: transparent;
    border: 1px solid #2a3347;
    border-radius: 10px;
    padding: 14px 20px;
    color: inherit;
    font-size: 14px; font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.18s, border-color 0.18s;
  }
  .rom-secondary-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.04);
    border-color: #4b5563;
  }
  [data-theme="light"] .rom-secondary-btn { border-color: #e5e7eb; }
  [data-theme="light"] .rom-secondary-btn:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.04);
    border-color: #9ca3af;
  }
  .rom-secondary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`

export default function RoleOnboardingModal({ forced = false, onClose, onComplete }) {
  const { user } = useAuth()
  // Étape courante : 1 = rôle principal, 2 = sous-rôle école. La 2 n'est
  // atteignable que si mainRole === 'ecole' au moment du Continuer.
  const [step, setStep] = useState(1)
  const [mainRole, setMainRole] = useState(null)
  const [customMainRole, setCustomMainRole] = useState('')
  const [schoolRole, setSchoolRole] = useState(null)
  const [customSchoolRole, setCustomSchoolRole] = useState('')
  const [saving, setSaving] = useState(false)

  // Pré-remplit les drafts depuis user_metadata si l'user a déjà fait
  // l'onboarding (mode test — ré-ouverture via le bouton debug). Pour un
  // user fraîchement inscrit, ces champs sont undefined donc rien ne se
  // pré-remplit.
  useEffect(() => {
    const md = user?.user_metadata
    if (!md) return
    if (md.role) setMainRole(md.role)
    if (md.custom_role) setCustomMainRole(md.custom_role)
    if (md.school_role) setSchoolRole(md.school_role)
    if (md.custom_school_role) setCustomSchoolRole(md.custom_school_role)
  }, [user?.id])

  // Esc fermeture — UNIQUEMENT en mode forcé (test debug). En vrai
  // onboarding après inscription, l'user doit compléter — pas d'échappa-
  // toire (sinon on rate la donnée qu'on essaie de collecter).
  useEffect(() => {
    if (!forced) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, forced])

  const handleContinue = async () => {
    if (!mainRole) return
    if (mainRole === 'autre' && !customMainRole.trim()) {
      toastStore?.error?.('Précise ton usage')
      return
    }
    if (mainRole === 'ecole') {
      // Étape 2 — demander le sous-rôle.
      setStep(2)
      return
    }
    // Pas école → on save et termine en une étape.
    await saveAndComplete()
  }

  const handleFinish = async () => {
    if (!schoolRole) return
    if (schoolRole === 'autre' && !customSchoolRole.trim()) {
      toastStore?.error?.("Précise ton rôle dans l'école")
      return
    }
    await saveAndComplete()
  }

  const saveAndComplete = async () => {
    setSaving(true)
    try {
      // updateUser fait un merge shallow des metadata — écrire ces
      // champs ne touche pas full_name, avatar_url, about, etc.
      const data = {
        role: mainRole,
        custom_role: mainRole === 'autre' ? customMainRole.trim() : null,
        school_role: mainRole === 'ecole' ? schoolRole : null,
        custom_school_role: mainRole === 'ecole' && schoolRole === 'autre'
          ? customSchoolRole.trim()
          : null,
        onboarding_completed: true,
      }
      const { error } = await supabase.auth.updateUser({ data })
      if (error) throw error
      toastStore?.success?.('Bienvenue sur JacPDF !')
      onComplete?.()
    } catch (err) {
      toastStore?.error?.(`Erreur : ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  // Validation par étape — désactive le bouton primaire tant que la
  // sélection est incomplète (et que le champ texte de "Autre" est vide).
  const isStep1Valid = mainRole && (mainRole !== 'autre' || customMainRole.trim().length > 0)
  const isStep2Valid = schoolRole && (schoolRole !== 'autre' || customSchoolRole.trim().length > 0)

  return (
    <>
      <style>{STYLES}</style>
      <div
        className="rom-overlay"
        // Clic extérieur ferme UNIQUEMENT en mode forcé (test). En vrai
        // onboarding, on bloque pour forçer l'user à compléter.
        onClick={forced ? onClose : undefined}
        role="presentation"
      >
        <div
          className="rom-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Configuration de ton profil"
        >
          {/* Bouton Fermer — visible uniquement en mode forcé (debug).
              En production l'user doit cliquer Terminer pour avancer. */}
          {forced && (
            <button className="rom-close" onClick={onClose} aria-label="Fermer (test)" title="Fermer (test)">
              ✕
            </button>
          )}

          {/* Stepper visuel — le 2e dot est grisé si l'user n'a pas
              sélectionné École (étape 2 ne s'appliquera pas). */}
          <div className="rom-stepper">
            <div className={`rom-step-dot ${step >= 1 ? 'active' : ''}`} />
            <div className="rom-step-line" />
            <div className={`rom-step-dot ${step >= 2 ? 'active' : ''} ${mainRole !== 'ecole' ? 'skipped' : ''}`} />
          </div>

          {step === 1 ? (
            <>
              <div className="rom-header">
                <h2 className="rom-title">Tu utilises JacPDF pour quoi ?</h2>
                <p className="rom-subtitle">Aide-nous à personnaliser ton expérience</p>
              </div>
              <div className="rom-cards">
                {MAIN_ROLES.map((r) => (
                  <button
                    key={r.id}
                    className={`rom-role-card ${mainRole === r.id ? 'active' : ''}`}
                    onClick={() => setMainRole(r.id)}
                    type="button"
                  >
                    <span className="rom-role-icon">{r.icon}</span>
                    <span className="rom-role-label">{r.label}</span>
                    <span className="rom-role-desc">{r.desc}</span>
                  </button>
                ))}
              </div>
              {/* Champ "Autre" apparaît seulement quand cette option est
                  sélectionnée — animé à l'apparition. */}
              {mainRole === 'autre' && (
                <input
                  type="text"
                  className="rom-input"
                  placeholder="Décris ton usage en quelques mots…"
                  value={customMainRole}
                  onChange={(e) => setCustomMainRole(e.target.value)}
                  maxLength={60}
                  autoFocus
                />
              )}
              <button
                className="rom-primary-btn"
                onClick={handleContinue}
                disabled={!isStep1Valid || saving}
                type="button"
              >
                {saving ? 'Enregistrement…' : (mainRole === 'ecole' ? 'Continuer →' : 'Terminer')}
              </button>
            </>
          ) : (
            <>
              <div className="rom-header">
                <h2 className="rom-title">Quel est ton rôle dans l'école ?</h2>
                <p className="rom-subtitle">Pour adapter les fonctionnalités scolaires</p>
              </div>
              <div className="rom-cards">
                {SCHOOL_ROLES.map((r) => (
                  <button
                    key={r.id}
                    className={`rom-role-card ${schoolRole === r.id ? 'active' : ''}`}
                    onClick={() => setSchoolRole(r.id)}
                    type="button"
                  >
                    <span className="rom-role-icon">{r.icon}</span>
                    <span className="rom-role-label">{r.label}</span>
                    <span className="rom-role-desc">{r.desc}</span>
                  </button>
                ))}
              </div>
              {schoolRole === 'autre' && (
                <input
                  type="text"
                  className="rom-input"
                  placeholder="Précise ton rôle…"
                  value={customSchoolRole}
                  onChange={(e) => setCustomSchoolRole(e.target.value)}
                  maxLength={60}
                  autoFocus
                />
              )}
              <div className="rom-actions">
                <button
                  className="rom-secondary-btn"
                  onClick={() => setStep(1)}
                  disabled={saving}
                  type="button"
                >
                  ← Retour
                </button>
                <button
                  className="rom-primary-btn"
                  onClick={handleFinish}
                  disabled={!isStep2Valid || saving}
                  type="button"
                >
                  {saving ? 'Enregistrement…' : 'Terminer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}