import { useState } from 'react'
import { useStore } from '../state'
import { visitsFromProtocol, setVisit, addVisit, removeVisit, toggleFormAtVisit, setLogForm } from '../domain/lab'
import { Btn, Panel, Pill, Table, ic } from './ui'

// The visit schedule: visits, windows, the forms at each visit, and the log forms.
export default function Schedule() {
  const { p, act } = useStore()
  const b = p!.build
  const forms = Object.keys(b.forms)
  const [nv, setNv] = useState({ id: '', name: '', day: '', lo: '', hi: '' })
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))
  return (
    <div className="space-y-4">
      <Panel title="Visits and windows" sub="Study day 1 is randomisation. A window is the range of study days the visit may fall on; the visit window edit check uses it." right={<Btn onClick={() => act((x) => visitsFromProtocol(x))}>Create the visits from the protocol</Btn>}>
        <Table head={['ID', 'Name', 'Target day', 'Window from', 'Window to', 'Forms', '']} empty="No visits yet. Create them from the protocol's schedule of activities, or add them one by one."
          rows={b.visits.map((v) => [
            <span className="font-mono">{v.id}</span>,
            <input aria-label={`${v.id} name`} className={ic('w-56')} value={v.name} onChange={(e) => act((x) => setVisit(x, v.id, { name: e.target.value }))} />,
            <input aria-label={`${v.id} target day`} type="number" className={ic('w-20')} value={v.day} onChange={(e) => act((x) => setVisit(x, v.id, { day: Number(e.target.value) }))} />,
            <input aria-label={`${v.id} window from`} type="number" className={ic('w-20')} value={v.lo} onChange={(e) => act((x) => setVisit(x, v.id, { lo: Number(e.target.value) }))} />,
            <input aria-label={`${v.id} window to`} type="number" className={ic('w-20')} value={v.hi} onChange={(e) => act((x) => setVisit(x, v.id, { hi: Number(e.target.value) }))} />,
            <span className="font-mono text-[10px]">{v.forms.join(', ') || '—'}</span>,
            <Btn tone="grey" onClick={() => act((x) => removeVisit(x, v.id))}>Remove</Btn>,
          ])} />
        <div className="flex flex-wrap items-end gap-2">
          {(['id', 'name', 'day', 'lo', 'hi'] as const).map((k) => <label key={k} className="text-xs text-lab-text-muted">{{ id: 'ID', name: 'Name', day: 'Target day', lo: 'From', hi: 'To' }[k]}<input className={ic(k === 'name' ? 'w-48' : 'w-20')} value={nv[k]} onChange={(e) => setNv({ ...nv, [k]: k === 'id' ? e.target.value.toUpperCase() : e.target.value })} /></label>)}
          <Btn tone="grey" disabled={!nv.id || !nv.name || num(nv.lo) === null || num(nv.hi) === null} onClick={() => { if (act((x) => addVisit(x, { id: nv.id, name: nv.name, day: num(nv.day) ?? 0, lo: num(nv.lo)!, hi: num(nv.hi)!, forms: [] }))) setNv({ id: '', name: '', day: '', lo: '', hi: '' }) }}>Add a visit</Btn>
        </div>
      </Panel>

      <Panel title="Forms at each visit" sub="Tick a form to collect it at a visit. Log forms (adverse events, medications, deviations) are collected at any time and are not ticked here.">
        {!forms.length || !b.visits.length ? <p className="text-xs text-lab-text-muted">Add visits and forms first.</p> : (
          <div className="overflow-x-auto rounded border border-lab-line">
            <table className="text-xs">
              <thead className="bg-lab-panel-strong font-mono text-[10px] uppercase text-lab-text-muted"><tr><th className="px-2 py-1.5 text-left">Form</th>{b.visits.map((v) => <th key={v.id} className="px-2 py-1.5">{v.id}</th>)}<th className="px-2 py-1.5">Log form</th></tr></thead>
              <tbody>
                {forms.map((f) => {
                  const log = p!.logForms.includes(f)
                  return (
                    <tr key={f} className="border-t border-lab-line/70">
                      <th scope="row" className="px-2 py-1 text-left font-normal"><span className="font-mono">{f}</span> <span className="text-lab-text-muted">{b.forms[f].name}</span></th>
                      {b.visits.map((v) => <td key={v.id} className="px-2 py-1 text-center">{log ? <span className="text-lab-text-muted">·</span> : <input type="checkbox" aria-label={`${f} at ${v.id}`} checked={v.forms.includes(f)} onChange={() => act((x) => toggleFormAtVisit(x, v.id, f))} />}</td>)}
                      <td className="px-2 py-1 text-center"><input type="checkbox" aria-label={`${f} is a log form`} checked={log} onChange={(e) => act((x) => setLogForm(x, f, e.target.checked))} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-lab-text-muted">Log forms: {p!.logForms.length ? p!.logForms.map((f) => <Pill key={f} className="mr-1">{f}</Pill>) : 'none'}</p>
      </Panel>
    </div>
  )
}
