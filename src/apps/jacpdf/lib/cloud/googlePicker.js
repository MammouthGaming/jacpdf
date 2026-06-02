import { getDriveAccessToken, DriveTokenExpiredError } from '@/apps/jacpdf/lib/cloud/googleDrive'

const PICKER_SCRIPT_SRC = 'https://apis.google.com/js/api.js'
let pickerLoadPromise = null

function loadGapiScript() {
  return new Promise((resolve, reject) => {
    if (window.gapi) {
      resolve()
      return
    }
    const existing = document.querySelector(`script[src="${PICKER_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('gapi load failed')))
      return
    }
    const script = document.createElement('script')
    script.src = PICKER_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google API script'))
    document.body.appendChild(script)
  })
}

async function ensurePickerLoaded() {
  if (pickerLoadPromise) return pickerLoadPromise
  pickerLoadPromise = (async () => {
    await loadGapiScript()
    await new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Failed to load Google Picker module')),
      })
    })
  })()
  return pickerLoadPromise
}

/**
 * Ouvre le Google Picker (style Kami) pour sélectionner un PDF.
 * @param {object} [opts]
 * @param {string} [opts.locale='fr']
 * @returns {Promise<{ fileId: string, name: string } | null>} null si l'user annule.
 */
export async function openGooglePicker({ locale = 'fr' } = {}) {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error(
      'VITE_GOOGLE_API_KEY manquante dans .env.local. Crée une API Key dans Google Cloud Console > APIs & Services > Credentials.'
    )
  }
  const appId = import.meta.env.VITE_GOOGLE_APP_ID
  if (!appId) {
    throw new Error(
      'VITE_GOOGLE_APP_ID manquante dans .env.local. C’est le numéro du projet Google Cloud (Project Number, pas Project ID). Trouve-le sur https://console.cloud.google.com/projectinfo'
    )
  }
  const token = await getDriveAccessToken()
  if (!token) throw new DriveTokenExpiredError()

  await ensurePickerLoaded()

  return new Promise((resolve) => {
    const { google } = window

    // Vue principale : Mon Drive avec navigation par dossiers
    const myDrive = new google.picker.DocsView()
      .setMimeTypes('application/pdf')
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setOwnedByMe(true)
      .setMode(google.picker.DocsViewMode.LIST)
      .setLabel('Mon Drive')

    // Vue : Partagés avec moi
    const sharedWithMe = new google.picker.DocsView()
      .setMimeTypes('application/pdf')
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setOwnedByMe(false)
      .setMode(google.picker.DocsViewMode.LIST)
      .setLabel('Partagés avec moi')

    // Vue : Récents (fichiers récemment ouverts via Picker)
    const recent = new google.picker.DocsView(google.picker.ViewId.RECENTLY_PICKED)
      .setMimeTypes('application/pdf')
      .setMode(google.picker.DocsViewMode.LIST)
      .setLabel('Récents')

    const picker = new google.picker.PickerBuilder()
      .addView(myDrive)
      .addView(sharedWithMe)
      .addView(recent)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setLocale(locale)
      .setTitle('Ouvrir depuis Google Drive')
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION]
        if (action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS]
          const doc = docs && docs[0]
          resolve(doc ? { fileId: doc.id, name: doc.name } : null)
        } else if (action === google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}