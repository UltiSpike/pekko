interface Props {
  onRequest: () => void
}

export default function PermissionBanner({ onRequest }: Props) {
  return (
    <div className="permission-banner">
      <div className="permission-title">PERMISSION REQUIRED</div>
      <div>Pekko needs Accessibility access to hear your keystrokes.</div>
      <button className="permission-btn" onClick={onRequest}>
        GRANT ACCESS
      </button>
    </div>
  )
}
