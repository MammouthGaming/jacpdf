import { Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from "@/shared/hooks/user/useAuth"
import { usePreferenceSync } from "@/apps/jacpdf/hooks/cloud/usePreferenceSync"
import { hydrateStudentProfile } from '@/shared/stores/user/studentProfileStore'

export default function AuthGate({ children }) {
  const { user, loading } = useAuth()
  usePreferenceSync() // sync silencieux en arrière-plan quand user connecté

  useEffect(() => {
    if (user && !user.is_anonymous) hydrateStudentProfile()
  }, [user])

  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  return children
}