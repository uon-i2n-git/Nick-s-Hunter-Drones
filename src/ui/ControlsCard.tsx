export function ControlsCard({ fading }: { fading: boolean }) {
  const rows: Array<[string, string]> = [
    ['SPACE', 'CLIMB'],
    ['CTRL / C', 'DESCEND'],
    ['W A S D', 'TRANSLATE'],
    ['Q / E', 'YAW'],
    ['SHIFT', 'BOOST'],
    ['F', 'ABILITY'],
    ['TAB', 'CAMERA'],
    ['R', 'RESTART'],
    ['H', 'CARD ON/OFF'],
    ['ESC', 'MENU'],
  ]
  return (
    <div className={`controls-card ${fading ? 'fading' : ''}`}>
      <div className="hud-label">FLIGHT CONTROLS</div>
      <div className="controls-grid">
        {rows.map(([k, v]) => (
          <div key={k} className="controls-row">
            <span className="key">{k}</span>
            <span className="act">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
