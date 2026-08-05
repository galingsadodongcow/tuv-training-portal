// Editor for one or more date blocks. Single block = a normal run.
// More blocks = staggered or skipping dates (e.g. Sep 11–14 & 17).
export default function DateSegments({ segments, onChange }) {
  const rows = segments.length ? segments : [{ start: '', end: '' }]

  const update = (i, k, v) => {
    const next = rows.map((s, idx) => (idx === i ? { ...s, [k]: v, ...(k === 'start' && !s.end ? { end: v } : {}) } : s))
    onChange(next)
  }
  const add = () => onChange([...rows, { start: '', end: '' }])
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div>
      {rows.map((s, i) => (
        <div key={i} className="toolbar" style={{ marginBottom: 8 }}>
          <input type="date" value={s.start} onChange={(e) => update(i, 'start', e.target.value)} required={i === 0} style={{ maxWidth: 170 }} />
          <span className="muted">to</span>
          <input type="date" value={s.end} min={s.start} onChange={(e) => update(i, 'end', e.target.value)} style={{ maxWidth: 170 }} />
          {rows.length > 1 && (
            <button type="button" className="linkbtn" onClick={() => remove(i)}>Remove</button>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={add}>+ Add date block (staggered dates)</button>
      <div className="fill-label" style={{ marginTop: 6 }}>
        Use extra blocks for skipping schedules, for example 11–14 then 17.
      </div>
    </div>
  )
}
