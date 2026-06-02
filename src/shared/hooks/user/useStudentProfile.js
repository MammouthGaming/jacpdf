import { useEffect, useState } from 'react'
import {
  getStudentProfile,
  hydrateStudentProfile,
  subscribeStudentProfile,
} from '@/shared/stores/user/studentProfileStore'

export function useStudentProfile({ hydrate = true } = {}) {
  const [profile, setProfile] = useState(() => getStudentProfile())

  useEffect(() => {
    const unsub = subscribeStudentProfile(setProfile)
    if (hydrate) hydrateStudentProfile()
    return unsub
  }, [hydrate])

  return profile
}