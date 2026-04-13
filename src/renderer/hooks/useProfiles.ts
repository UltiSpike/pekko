import { useState, useEffect } from 'react'
import { Profile } from '@shared/types'

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!window.api) { setLoading(false); return }
    window.api.getProfiles()
      .then((data: any) => setProfiles(data.profiles || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { profiles, loading }
}
