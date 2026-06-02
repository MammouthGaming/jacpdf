import {
  getDriveAccessToken,
  JacdocDriveTokenExpiredError,
  JACDOC_DRIVE_MIME,
} from '@/apps/jacdoc/lib/cloud/jacdocGoogleDrive'

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
 * Google Picker pour JacDoc.
 *
 * On filtre sur application/json, puis JacdocGoogleDrive vérifie le contenu
 * réel (`app: "JacDoc"`) après téléchargement. C’est volontaire : Google
 * Picker ne sait pas filtrer parfaitement sur une extension custom.
 */
export async function openJacdocGooglePicker({ locale = 'fr' } = {}) {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('VITE_GOOGLE_API_KEY manquante dans .env.local.')
  }

  const appId = import.meta.env.VITE_GOOGLE_APP_ID
  if (!appId) {
    throw new Error('VITE_GOOGLE_APP_ID manquante dans .env.local.')
  }

  const token = await getDriveAccessToken()
  if (!token) throw new JacdocDriveTokenExpiredError()

  await ensurePickerLoaded()

  return new Promise((resolve) => {
    const { google } = window

    const myDrive = new google.picker.DocsView()
      .setMimeTypes(JACDOC_DRIVE_MIME)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setOwnedByMe(true)
      .setMode(google.picker.DocsViewMode.LIST)
      .setLabel('Mon Drive')

    const sharedWithMe = new google.picker.DocsView()
      .setMimeTypes(JACDOC_DRIVE_MIME)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setOwnedByMe(false)
      .setMode(google.picker.DocsViewMode.LIST)
      .setLabel('Partagés avec moi')

    const recent = new google.picker.DocsView(google.picker.ViewId.RECENTLY_PICKED)
      .setMimeTypes(JACDOC_DRIVE_MIME)
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
      .setTitle('Ouvrir un document JacDoc depuis Google Drive')
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