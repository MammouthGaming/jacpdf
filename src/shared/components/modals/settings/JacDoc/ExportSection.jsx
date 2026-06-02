import FsmSelect from '../shared/FsmSelect'
import { useStoredSetting } from '../shared/useStoredSetting'
import '../FullSettingsModal.css'

// Section Export JacDoc — format, qualité, nommage et action post-export.
export default function ExportSection() {
  const [exportFormat, setExportFormat] = useStoredSetting('jacdoc_settings_export_format', 'pdf')
  const [exportQuality, setExportQuality] = useStoredSetting('jacdoc_settings_export_quality', 'standard')
  const [exportFileName, setExportFileName] = useStoredSetting('jacdoc_settings_export_file_name', 'jacdoc-title')
  const [exportIncludeComments, setExportIncludeComments] = useStoredSetting('jacdoc_settings_export_include_comments', 'false')
  const [exportIncludeMetadata, setExportIncludeMetadata] = useStoredSetting('jacdoc_settings_export_include_metadata', 'true')
  const [exportIncludeTrackChanges, setExportIncludeTrackChanges] = useStoredSetting('jacdoc_settings_export_include_track_changes', 'false')
  const [exportAfterSave, setExportAfterSave] = useStoredSetting('jacdoc_settings_export_after_save', 'ask')

  const isPdf = exportFormat === 'pdf'

  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">Export</h3>
      <p className="fsm-section-sub">Préférences appliquées lors d’un export ou partage de document</p>

      <h4 className="fsm-group-title">Format</h4>
      <div className="fsm-field">
        <label className="fsm-label">Format par défaut</label>
        <p className="fsm-label-sub">Pré-sélection ; tu peux toujours changer dans la boîte de dialogue d’export</p>
        <FsmSelect
          value={exportFormat}
          onChange={setExportFormat}
          options={[
            { value: 'pdf',      label: 'PDF (.pdf)' },
            { value: 'docx',     label: 'Word (.docx)' },
            { value: 'odt',      label: 'OpenDocument (.odt)' },
            { value: 'html',     label: 'HTML (.html)' },
            { value: 'markdown', label: 'Markdown (.md)' },
            { value: 'txt',      label: 'Texte brut (.txt)' },
          ]}
        />
      </div>
      <div className={`fsm-field ${!isPdf ? 'fsm-perf-row-disabled' : ''}`}>
        <label className="fsm-label">Qualité PDF</label>
        <p className="fsm-label-sub">Compromis taille / piqué des images intégrées (s’applique uniquement aux exports PDF)</p>
        <div className="fsm-theme-row">
          <button className={`fsm-theme-btn ${exportQuality === 'light' ? 'active' : ''}`} onClick={() => setExportQuality('light')} disabled={!isPdf}>
            <span>Léger</span>
          </button>
          <button className={`fsm-theme-btn ${exportQuality === 'standard' ? 'active' : ''}`} onClick={() => setExportQuality('standard')} disabled={!isPdf}>
            <span>Standard</span>
          </button>
          <button className={`fsm-theme-btn ${exportQuality === 'high' ? 'active' : ''}`} onClick={() => setExportQuality('high')} disabled={!isPdf}>
            <span>Haute</span>
          </button>
        </div>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Nom du fichier exporté</h4>
      <FsmSelect
        value={exportFileName}
        onChange={setExportFileName}
        options={[
          { value: 'jacdoc-title',  label: 'JacDoc – {Titre}' },
          { value: 'title',         label: '{Titre}' },
          { value: 'title-date',    label: '{Titre} – {Date}' },
          { value: 'title-version', label: '{Titre} – v{Version}' },
          { value: 'ask',           label: 'Me demander à chaque export' },
        ]}
      />
      <p className="fsm-label-sub">Format appliqué par défaut au nom de fichier proposé lors d’un export</p>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Contenu inclus</h4>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Inclure les commentaires</label>
          <p className="fsm-label-sub">Annexe avec la liste des commentaires (à la fin du document ou en marge selon le format)</p>
        </div>
        <button
          className={`fsm-toggle ${exportIncludeComments === 'true' ? 'on' : ''}`}
          onClick={() => setExportIncludeComments(exportIncludeComments === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Inclure les métadonnées</label>
          <p className="fsm-label-sub">Auteur, date de création, date de modification ; à décocher avant un partage public anonyme</p>
        </div>
        <button
          className={`fsm-toggle ${exportIncludeMetadata === 'true' ? 'on' : ''}`}
          onClick={() => setExportIncludeMetadata(exportIncludeMetadata === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>
      <div className="fsm-toggle-row">
        <div>
          <label className="fsm-label">Inclure le suivi des modifications</label>
          <p className="fsm-label-sub">Conserve les modifications acceptées / rejetées dans l’export (utile pour la relecture)</p>
        </div>
        <button
          className={`fsm-toggle ${exportIncludeTrackChanges === 'true' ? 'on' : ''}`}
          onClick={() => setExportIncludeTrackChanges(exportIncludeTrackChanges === 'true' ? 'false' : 'true')}
        >
          <span className="fsm-toggle-thumb" />
        </button>
      </div>

      <div className="fsm-divider" />

      <h4 className="fsm-group-title">Après l’export</h4>
      <p className="fsm-label-sub">Action exécutée une fois le fichier généré et sauvegardé</p>
      <div className="fsm-theme-row">
        <button className={`fsm-theme-btn ${exportAfterSave === 'open' ? 'active' : ''}`} onClick={() => setExportAfterSave('open')}>
          <span>Ouvrir</span>
        </button>
        <button className={`fsm-theme-btn ${exportAfterSave === 'share' ? 'active' : ''}`} onClick={() => setExportAfterSave('share')}>
          <span>Partager</span>
        </button>
        <button className={`fsm-theme-btn ${exportAfterSave === 'reveal' ? 'active' : ''}`} onClick={() => setExportAfterSave('reveal')}>
          <span>Révéler</span>
        </button>
        <button className={`fsm-theme-btn ${exportAfterSave === 'nothing' ? 'active' : ''}`} onClick={() => setExportAfterSave('nothing')}>
          <span>Rien</span>
        </button>
        <button className={`fsm-theme-btn ${exportAfterSave === 'ask' ? 'active' : ''}`} onClick={() => setExportAfterSave('ask')}>
          <span>Demander</span>
        </button>
      </div>
    </div>
  )
}