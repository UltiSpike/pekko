interface Props {
  wpm: number
  active: boolean
}

export default function TypingIndicator({ wpm, active }: Props) {
  // 5 dots — randomly lit when active based on wpm intensity
  const dots = Array.from({ length: 5 }, (_, i) => {
    if (!active) return false
    // More dots active at higher WPM
    const threshold = (i + 1) * 20 // 20, 40, 60, 80, 100
    return wpm >= threshold
  })

  return (
    <div className="typing-indicator" style={{ opacity: active ? 1 : 0.3 }}>
      <div className="typing-dots">
        {dots.map((on, i) => (
          <div key={i} className={`typing-dot ${on ? 'active' : ''}`} />
        ))}
      </div>
      {active && (
        <span className={`typing-wpm ${wpm > 60 ? 'fast' : ''}`}>
          {wpm} WPM
        </span>
      )}
    </div>
  )
}
