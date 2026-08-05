'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useYears } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'

export default function Rollover() {
  const years = useYears()
  const qc = useQueryClient()
  const [mode, setMode] = useState('Copy')
  const [fromYear, setFromYear] = useState<any>(2026)
  const [toYear, setToYear] = useState<any>(2027)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const run = async () => {
    setResult(null)
    const y = Number(toYear)
    // Validate before touching anything: a real year, not one that already
    // exists, and (for a copy) different from the source.
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      setResult({ ok: false, msg: 'Enter a valid new year between 2000 and 2100.' }); return
    }
    if ((years.data || []).some((yr) => yr.year === y)) {
      setResult({ ok: false, msg: `${y} already exists. Pick a year that has not been opened yet.` }); return
    }
    if (mode === 'Copy' && y === Number(fromYear)) {
      setResult({ ok: false, msg: 'The new year must differ from the year you copy from.' }); return
    }
    if (mode === 'Copy' &&
        !window.confirm(`This clones every non-cancelled ${fromYear} session into ${y} and archives ${fromYear}. Continue?`)) {
      return
    }
    setBusy(true)
    try {
      if (mode === 'Copy') {
        const { data, error } = await supabase.rpc('fn_rollover_copy', {
          p_from_year: Number(fromYear),
          p_to_year: y,
        })
        if (error) throw error
        setResult({ ok: true, msg: `Copied ${data} sessions into ${y}. ${fromYear} archived.` })
      } else {
        const { error } = await supabase.from('calendar_year').insert({ year: y, mode: 'Rebuild' })
        if (error) throw error
        setResult({ ok: true, msg: `Created a blank ${y} calendar against the existing course catalog.` })
      }
      qc.invalidateQueries({ queryKey: ['years'] })
    } catch (err) {
      setResult({ ok: false, msg: err.message })
    }
    setBusy(false)
  }

  if (years.isLoading) return <Spinner label="Loading years" />
  if (years.error) return <ErrorNote error={years.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Annual rollover</h1>
          <p>Open the next training year. Rebuild starts blank. Copy clones this year with shifted dates.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <label className="field">
          <span>Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="Copy">Copy last year, shift dates</option>
            <option value="Rebuild">Rebuild, start blank</option>
          </select>
        </label>

        {mode === 'Copy' && (
          <label className="field">
            <span>Copy from year</span>
            <select value={fromYear} onChange={(e) => setFromYear(e.target.value)}>
              {years.data.map((y) => (
                <option key={y.year_id} value={y.year}>{y.year}</option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>New year</span>
          <input type="number" value={toYear} onChange={(e) => setToYear(e.target.value)} />
        </label>

        <div className="notice notice-warn" style={{ marginBottom: 14 }}>
          {mode === 'Copy'
            ? `This clones every non-cancelled ${fromYear} session into ${toYear} and archives ${fromYear}.`
            : `This creates an empty ${toYear} calendar. Courses, fees, and users carry over.`}
        </div>

        {result && (
          <div className={`notice ${result.ok ? 'notice-info' : 'notice-error'}`} style={{ marginBottom: 14 }}>
            {result.msg}
          </div>
        )}

        <button className="btn" onClick={run} disabled={busy}>
          {busy ? 'Working…' : mode === 'Copy' ? 'Copy and archive' : 'Create blank year'}
        </button>
      </div>

      <div className="card" style={{ marginTop: 20, maxWidth: 560 }}>
        <table>
          <thead>
            <tr><th>Year</th><th>Mode</th><th>Status</th></tr>
          </thead>
          <tbody>
            {years.data.map((y) => (
              <tr key={y.year_id}>
                <td>{y.year}</td>
                <td>{y.mode}</td>
                <td>
                  <span className={`pill ${y.status === 'Active' ? 'pill-confirmed' : 'pill-cancelled'}`}>{y.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
