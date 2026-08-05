'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'

interface ThemeCtx {
  theme: Theme
  density: Density
  setTheme: (t: Theme) => void
  setDensity: (d: Density) => void
}
const Ctx = createContext<ThemeCtx | null>(null)

function applyTheme(t: Theme) {
  const el = document.documentElement
  if (t === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', t)
}
function applyDensity(d: Density) {
  document.documentElement.setAttribute('data-density', d)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [density, setDensityState] = useState<Density>('comfortable')

  useEffect(() => {
    const t = (localStorage.getItem('theme') as Theme) || 'system'
    const d = (localStorage.getItem('density') as Density) || 'comfortable'
    setThemeState(t)
    setDensityState(d)
    applyTheme(t)
    applyDensity(d)
  }, [])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('theme', t)
    applyTheme(t)
  }
  const setDensity = (d: Density) => {
    setDensityState(d)
    localStorage.setItem('density', d)
    applyDensity(d)
  }

  return <Ctx.Provider value={{ theme, density, setTheme, setDensity }}>{children}</Ctx.Provider>
}

export const useTheme = (): ThemeCtx => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTheme must be used within ThemeProvider')
  return c
}
