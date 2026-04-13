import { useState } from 'react'
import { Profile } from '@shared/types'

interface Props {
  profiles: Profile[]
  activeProfile: string
  onChange: (id: string) => void
}

const TABS = [
  { key: 'all', label: 'ALL' },
  { key: 'linear', label: 'LINEAR' },
  { key: 'tactile', label: 'TACTILE' },
  { key: 'clicky', label: 'CLICKY' },
] as const

type TabKey = typeof TABS[number]['key']

export default function ProfileSelector({ profiles, activeProfile, onChange }: Props) {
  const [tab, setTab] = useState<TabKey>('all')

  const filtered = tab === 'all' ? profiles : profiles.filter(p => p.type === tab)
  const isHQ = (id: string) => id.startsWith('cherrymx-') || id.startsWith('topre-purple') || id === 'nk-cream'

  return (
    <>
      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="profile-list">
        {filtered.map(p => (
          <div
            key={p.id}
            className={`profile-item ${activeProfile === p.id ? 'active' : ''}`}
            onClick={() => onChange(p.id)}
          >
            <span className="profile-name">{p.name}</span>
            <span className={`profile-badge badge-${p.type}`}>{p.type.slice(0, 3).toUpperCase()}</span>
            {isHQ(p.id) && <span className="badge-hq">HQ</span>}
          </div>
        ))}
      </div>
    </>
  )
}
