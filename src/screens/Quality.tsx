'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useNpsSummary, useTrainerQuality } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import ChartTable, { ChartTableToggle } from '../components/ChartTable'

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="fill-label">—</span>
  return <span title={`${value} of 5`}>{'★'.repeat(Math.round(value))}<span style={{ color: 'var(--text-faint)' }}>{'★'.repeat(5 - Math.round(value))}</span> <span className="fill-label">{Number(value).toFixed(1)}</span></span>
}

// The feedback/quality analytics: post-course sentiment and trainer scores.
// Rendered as the "Quality" tab of the single Analytics shell (`embedded`). The
// complaint register moved out to its own record list (/complaints) — it is a
// list of records to work, not an analytics view.
export default function Quality({ embedded }: { embedded?: boolean } = {}) {
  const nps = useNpsSummary()
  const trainers = useTrainerQuality()
  const [tab, setTab] = useState<'overview' | 'trainers'>('overview')
  const [npsTable, setNpsTable] = useState(false)

  const seg = (
    <div className="seg">
      <button className={`seg-btn ${tab === 'overview' ? 'on' : ''}`} onClick={() => setTab('overview')}>Overview</button>
      <button className={`seg-btn ${tab === 'trainers' ? 'on' : ''}`} onClick={() => setTab('trainers')}>Trainers</button>
    </div>
  )

  return (
    <>
      {embedded ? (
        <div className="toolbar" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>{seg}</div>
      ) : (
        <div className="page-head">
          <div>
            <h1>Feedback and quality</h1>
            <p>Post-course sentiment and trainer scores. Complaints live in the <Link href="/complaints">complaint register</Link>.</p>
          </div>
          {seg}
        </div>
      )}

      {tab === 'overview' && (
        nps.isLoading ? <Spinner label="Loading feedback" /> : nps.error ? <ErrorNote error={nps.error} /> : !nps.data || Number(nps.data.responses) === 0 ? (
          <div className="card"><div className="empty">No feedback captured yet. Record responses from a session's Feedback tab.</div></div>
        ) : (
          <div className="card card-pad">
            <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="k-label">Feedback summary</div>
              <ChartTableToggle on={npsTable} onToggle={() => setNpsTable((v) => !v)} />
            </div>
            {npsTable ? (
              <ChartTable
                caption="Feedback summary"
                columns={[{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' }]}
                rows={[
                  { metric: 'NPS', value: nps.data.nps_score ?? '—' },
                  { metric: 'Responses', value: nps.data.responses },
                  { metric: 'Promoters', value: nps.data.promoters },
                  { metric: 'Passives', value: nps.data.passives },
                  { metric: 'Detractors', value: nps.data.detractors },
                  { metric: 'Content score', value: nps.data.avg_content == null ? '—' : `${Number(nps.data.avg_content).toFixed(1)} of 5` },
                  { metric: 'Trainer score', value: nps.data.avg_trainer == null ? '—' : `${Number(nps.data.avg_trainer).toFixed(1)} of 5` },
                ]}
              />
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <div><div className="k-label">NPS</div><div className="k-value" style={{ color: Number(nps.data.nps_score) >= 0 ? 'inherit' : 'var(--danger)' }}>{nps.data.nps_score ?? '—'}</div><div className="fill-label">{nps.data.responses} responses</div></div>
                <div><div className="k-label">Promoters</div><div className="k-value">{nps.data.promoters}</div></div>
                <div><div className="k-label">Passives</div><div className="k-value">{nps.data.passives}</div></div>
                <div><div className="k-label">Detractors</div><div className="k-value">{nps.data.detractors}</div></div>
                <div><div className="k-label">Content</div><div className="k-value"><Stars value={nps.data.avg_content} /></div></div>
                <div><div className="k-label">Trainer</div><div className="k-value"><Stars value={nps.data.avg_trainer} /></div></div>
              </div>
            )}
          </div>
        )
      )}

      {tab === 'trainers' && (
        trainers.isLoading ? <Spinner label="Loading trainer scores" /> : trainers.error ? <ErrorNote error={trainers.error} /> : (
          <div className="card">
            {(trainers.data?.length || 0) === 0 ? <div className="empty">No active trainers.</div> : (
              <table>
                <thead><tr><th>Trainer</th><th className="right">Responses</th><th>Trainer score</th><th>Content</th><th className="right">NPS</th></tr></thead>
                <tbody>
                  {(trainers.data || []).map((t: any) => (
                    <tr key={t.trainer_id}>
                      <td style={{ fontWeight: 600 }}>{t.name} <span className="fill-label">{t.code}</span></td>
                      <td className="right">{t.responses}</td>
                      <td><Stars value={t.avg_trainer} /></td>
                      <td><Stars value={t.avg_content} /></td>
                      <td className="right">{t.nps_score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      )}
    </>
  )
}
