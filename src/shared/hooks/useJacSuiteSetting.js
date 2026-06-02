import { useState, useEffect } from 'react'

// Hook read-only pour consommer un réglage écrit par FullSettingsModal.
// Resynchronise automatiquement quand l'événement 'jacsuite:settingsChanged'
// est dispatché par useStoredSetting (settings/shared/useStoredSetting.js).
// Écoute aussi 'storage' pour les changements depuis un autre onglet.
export function useJacSuiteSetting(key, fallback) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) ?? fallback }
    catch { return fallback }
  })
  useEffect(() => {
    const onChange = () => {
      try { setValue(localStorage.getItem(key) ?? fallback) }
      catch {}
    }
    window.addEventListener('jacsuite:settingsChanged', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('jacsuite:settingsChanged', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [key, fallback])
  return value
}

// Variante booléenne : convertit la string 'true'/'false' en booléen.
export function useJacSuiteBool(key, fallback = false) {
  const stored = useJacSuiteSetting(key, fallback ? 'true' : 'false')
  return stored === 'true'
}

// Variante numérique : convertit la string en Number, fallback si NaN.
export function useJacSuiteNumber(key, fallback) {
  const stored = useJacSuiteSetting(key, String(fallback))
  const n = Number(stored)
  return Number.isFinite(n) ? n : fallback
}

// Variante JSON : pour les clés stockées comme JSON (ex 'jaccalendrier_calendars').
export function useJacSuiteJson(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch { return fallback }
  })
  useEffect(() => {
    const onChange = () => {
      try {
        const raw = localStorage.getItem(key)
        setValue(raw ? JSON.parse(raw) : fallback)
      } catch {}
    }
    window.addEventListener('jacsuite:settingsChanged', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('jacsuite:settingsChanged', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [key])
  return value
}