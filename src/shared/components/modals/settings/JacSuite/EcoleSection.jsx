import { useMemo, useRef, useState } from 'react'
import '../FullSettingsModal.css'
import FsmSelect from '../shared/FsmSelect'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useStudentProfile } from '@/shared/hooks/user/useStudentProfile'
import ClassroomPanel from './ClassroomPanel'
import {
  updateStudentProfile,
  uploadStudentPhoto,
  removeStudentPhoto,
  resetStudentProfile,
} from '@/shared/stores/user/studentProfileStore'
import {
  ANNEES_PROGRAMME,
  NIVEAUX_SCOLAIRES,
  TYPES_ETABLISSEMENT,
} from '@/shared/lib/user/studentConstants'
import { QC_INSTITUTIONS, findInstitutionByName } from '@/shared/lib/user/qcInstitutions'

export default function EcoleSection() {
  const { user } = useAuth()
  const profile = useStudentProfile()
  const schoolRole = user?.user_metadata?.school_role
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const filteredInstitutions = useMemo(() => {
    if (!profile.typeEtablissement) return QC_INSTITUTIONS
    return QC_INSTITUTIONS.filter((institution) => institution.type === profile.typeEtablissement)
  }, [profile.typeEtablissement])

  const selectedInstitution = useMemo(
    () => findInstitutionByName(profile.nomEcole),
    [profile.nomEcole],
  )

  const campusOptions = selectedInstitution?.campus || []

  const handleInstitutionChange = (name) => {
    const institution = findInstitutionByName(name)
    updateStudentProfile({
      nomEcole: name,
      typeEtablissement: institution?.type || profile.typeEtablissement,
      ville: institution?.city || profile.ville,
      campus: institution?.campus?.length === 1 ? institution.campus[0] : '',
    })
  }

  const handleTypeChange = (type) => {
    updateStudentProfile({
      typeEtablissement: type || null,
      nomEcole: '',
      campus: '',
      ville: '',
    })
  }

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      await uploadStudentPhoto(file)
    } catch (err) {
      console.error('[EcoleSection] upload photo failed', err)
      alert(`Échec du téléversement de la photo : ${err.message}`)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleReset = async () => {
    const ok = confirm('Réinitialiser ton profil étudiant ? Les données locales, serveur et la photo étudiante seront effacées.')
    if (!ok) return
    await resetStudentProfile()
  }

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">École</h3>
      <p className="fsm-section-sub">Profil étudiant, établissement et JacSuite Classroom</p>

      <div className="fsm-perf-warning fsm-school-info">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 10v6"/>
          <path d="M2 10l10-5 10 5-10 5z"/>
          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
        <div>
          <p className="fsm-perf-warning-title">
            Section scolaire activée {schoolRole ? `• ${schoolRole === 'enseignant' ? 'Enseignant' : schoolRole === 'eleve' ? 'Élève' : schoolRole}` : ''}
          </p>
          <p className="fsm-perf-warning-text">
            Le rôle enseignant / élève vient de l'onboarding du compte. Classroom s'adapte automatiquement.
          </p>
        </div>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Photo étudiante</h4>
      <div className="fsm-school-photo-row">
        <div className="fsm-school-photo-avatar">
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt="Photo étudiante"
              className="fsm-school-photo-img"
            />
          ) : (
            <span className="fsm-school-photo-placeholder">📷</span>
          )}
        </div>

        <div className="fsm-school-photo-content">
          <div className="fsm-school-photo-actions">
            <button
              className="fsm-action-btn fsm-action-btn-inline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || profile.syncing}
            >
              {uploading ? 'Téléversement…' : profile.photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
            </button>

            {profile.photoUrl && (
              <button
                className="fsm-action-btn fsm-action-btn-inline"
                onClick={removeStudentPhoto}
                disabled={uploading || profile.syncing}
              >
                Retirer
              </button>
            )}
          </div>

          <p className="fsm-label-sub fsm-school-photo-hint">
            Photo distincte de ta photo sociale. Stockée dans le bucket privé <code>student-photos</code>.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            hidden
          />
        </div>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Informations scolaires</h4>

      <div className="fsm-school-card fsm-school-grid">
      <div className="fsm-field">
        <label className="fsm-label">Niveau scolaire</label>
        <p className="fsm-label-sub">Sélectionne le niveau qui décrit le mieux ton parcours actuel.</p>
        <FsmSelect
          value={profile.niveauScolaire || ''}
          onChange={(v) => updateStudentProfile({ niveauScolaire: v || null })}
          placeholder="— Choisir —"
          options={NIVEAUX_SCOLAIRES.map((niveau) => ({ value: niveau.value, label: niveau.label }))}
        />
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Programme d'études</label>
        <p className="fsm-label-sub">Ex. Sciences informatiques et mathématiques.</p>
        <input
          type="text"
          className="fsm-select"
          value={profile.programme}
          placeholder="Programme d'études"
          onChange={(e) => updateStudentProfile({ programme: e.target.value })}
        />
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Année dans le programme</label>
        <FsmSelect
          value={profile.annee != null ? String(profile.annee) : ''}
          onChange={(v) => updateStudentProfile({ annee: v ? Number(v) : null })}
          placeholder="— Choisir —"
          options={ANNEES_PROGRAMME.map((annee) => ({ value: String(annee), label: String(annee) }))}
        />
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Numéro étudiant / DA / matricule</label>
        <input
          type="text"
          className="fsm-select"
          value={profile.numeroEtudiant}
          placeholder="ex. 20123456"
          onChange={(e) => updateStudentProfile({ numeroEtudiant: e.target.value })}
        />
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Courriel institutionnel</label>
        <input
          type="email"
          className="fsm-select"
          value={profile.courrielInstitutionnel}
          placeholder="prenom.nom@ecole.ca"
          onChange={(e) => updateStudentProfile({ courrielInstitutionnel: e.target.value })}
        />
      </div>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Établissement</h4>

      <div className="fsm-school-card fsm-school-grid">
      <div className="fsm-field">
        <label className="fsm-label">Type d'établissement</label>
        <FsmSelect
          value={profile.typeEtablissement || ''}
          onChange={(v) => handleTypeChange(v)}
          placeholder="— Choisir —"
          options={TYPES_ETABLISSEMENT.map((type) => ({ value: type.value, label: type.label }))}
        />
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Nom de l'école</label>
        <p className="fsm-label-sub">Autocomplete léger avec les principales institutions du Québec.</p>
        <input
          className="fsm-select"
          list="qc-institutions"
          value={profile.nomEcole}
          placeholder="ex. UQAM, McGill, Cégep du Vieux Montréal…"
          onChange={(e) => handleInstitutionChange(e.target.value)}
        />
        <datalist id="qc-institutions">
          {filteredInstitutions.map((institution) => (
            <option key={institution.name} value={institution.name} />
          ))}
        </datalist>
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Campus</label>
        {campusOptions.length > 0 ? (
          <FsmSelect
            value={profile.campus}
            onChange={(v) => updateStudentProfile({ campus: v })}
            placeholder="— Choisir —"
            options={campusOptions.map((campus) => ({ value: campus, label: campus }))}
          />
        ) : (
          <input
            type="text"
            className="fsm-select"
            value={profile.campus}
            placeholder="Campus"
            onChange={(e) => updateStudentProfile({ campus: e.target.value })}
          />
        )}
      </div>

      <div className="fsm-field">
        <label className="fsm-label">Ville</label>
        <input
          type="text"
          className="fsm-select"
          value={profile.ville}
          placeholder="Ville"
          onChange={(e) => updateStudentProfile({ ville: e.target.value })}
        />
      </div>
      </div>

      <ClassroomPanel schoolRole={schoolRole} />

      {profile.error && (
        <div className="fsm-perf-warning fsm-school-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <p className="fsm-perf-warning-title">Synchronisation interrompue</p>
            <p className="fsm-perf-warning-text">{profile.error}</p>
          </div>
        </div>
      )}

      <div className="fsm-divider" />

      <div className="fsm-toggle-row fsm-school-status-row">
        <div>
          <label className="fsm-label">État</label>
          <p className="fsm-label-sub">
            {profile.syncing
              ? 'Synchronisation Supabase en cours…'
              : 'Données scolaires sauvegardées localement. Sync finale à brancher plus tard.'}
          </p>
        </div>
        <button
          className="fsm-action-btn fsm-action-btn-inline"
          onClick={handleReset}
          disabled={profile.syncing}
          title="Efface le profil étudiant local et serveur"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  )
}