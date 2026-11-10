import { useState } from 'react'
import { useStore } from '../state'
import { LIBRARY_CODELISTS, addCodelist, setCodelist, removeCodelist } from '../domain/lab'
import { Btn, Panel, Table, ic } from './ui'

// Codelists: the values a pick-list or yes/no field can take. Values follow CDISC Controlled
// Terminology where a codelist exists; the label is what sites see.
export default function Codelists() {
  const { p, act } = useStore()
  const b = p!.build
  const [nid, setNid] = useState('')
  const used = (id: string) => Object.values(b.forms).flatMap((f) => f.fields.filter((x) => x.codelist === id).map((x) => `${f.id}.${x.id}`))
  const fromLib = Object.keys(LIBRARY_CODELISTS).filter((k) => !b.codelists[k])
  return (
    <div className="space-y-4">
      <Panel title="Codelists" sub="A submission value (stored, as in CDISC Controlled Terminology) and a label (shown to sites). Values already used by entered data must not be removed once the study is live.">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-lab-text-muted">New codelist ID<input className={ic('w-40')} value={nid} onChange={(e) => setNid(e.target.value.toUpperCase())} list="lib-cl" /></label>
          <datalist id="lib-cl">{fromLib.map((k) => <option key={k} value={k} />)}</datalist>
          <Btn tone="grey" disabled={!nid} onClick={() => { if (act((x) => addCodelist(x, nid))) setNid('') }}>Add{LIBRARY_CODELISTS[nid] ? ' from the library' : ''}</Btn>
        </div>
      </Panel>
      <div className="grid lg:grid-cols-2 gap-4">
        {Object.entries(b.codelists).map(([id, list]) => (
          <Panel key={id} title={id} sub={used(id).length ? `Used by ${used(id).join(', ')}` : 'Not used by any field'} right={<Btn tone="grey" onClick={() => act((x) => removeCodelist(x, id))}>Remove</Btn>}>
            <Table head={['Submission value', 'Label', '']} rows={list.map((c, i) => [
              <input aria-label={`${id} value ${i + 1}`} className={ic('font-mono')} value={c.value} onChange={(e) => act((x) => setCodelist(x, id, list.map((y, j) => (j === i ? { ...y, value: e.target.value } : y))))} />,
              <input aria-label={`${id} label ${i + 1}`} className={ic('')} value={c.label} onChange={(e) => act((x) => setCodelist(x, id, list.map((y, j) => (j === i ? { ...y, label: e.target.value } : y))))} />,
              <Btn tone="grey" onClick={() => act((x) => setCodelist(x, id, list.filter((_, j) => j !== i)))}>Remove</Btn>,
            ])} empty="No values." />
            <Btn tone="grey" onClick={() => act((x) => setCodelist(x, id, [...list, { value: '', label: '' }]))}>Add a value</Btn>
          </Panel>
        ))}
      </div>
    </div>
  )
}
