'use client'
import { useTheme, Theme } from './ThemeProvider'

const THEMES: { key: Theme; icon: string; label: string }[] = [
  { key: 'light', icon: '☀', label: 'Light' },
  { key: 'dark', icon: '☾', label: 'Dark' },
  { key: 'system', icon: '⌂', label: 'System' },
]

export default function ThemeToggle() {
  const { theme, density, setTheme, setDensity } = useTheme()
  return (
    <div className="theme-toggle">
      <div className="seg" role="group" aria-label="Color theme">
        {THEMES.map((t) => (
          <button
            key={t.key}
            className={`seg-btn ${theme === t.key ? 'on' : ''}`}
            onClick={() => setTheme(t.key)}
            aria-pressed={theme === t.key}
            title={`${t.label} theme`}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <button
        className="seg-btn density"
        onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        title="Toggle row density"
      >
        {density === 'compact' ? 'Compact' : 'Cozy'}
      </button>
    </div>
  )
}
