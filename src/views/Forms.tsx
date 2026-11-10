import { useState } from 'react'
import { useStore } from '../state'
import { useNav } from '../App'
import { LIBRARY, LIBRARY_NOTE, addLibraryForm, addBlankForm, removeForm, setForm, addField, setField, moveField, removeField, touched } from '../domain/lab'
import type { Field, FieldType, FormDef } from '../domain/study'
import { Btn, Panel, Pill, Select, Table, TextArea, ic } from './ui'

const TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'yn']

// The eCRF forms: add from the CDASH library or design, edit fields, preview as a site sees it.
export default function Forms() {
  const { p, act } = useStore()
  const { arg } = useNav()
  const b = p!.build
  const ids = Object.keys(b.forms)
  const [sel, setSel] = useState<string>(arg && b.forms[arg] ? arg : ids[0] ?? '')
  const [nf, setNf] = useState({ id: '', name: '', domain: '' })
  const libLeft = Object.keys(LIBRARY).filter((k) => !b.forms[k])
  const form = b.forms[sel]
  return (
    <div className="grid lg:grid-cols-[16rem_1fr] gap-4">
      <div className="space-y-3">
        <Panel title="Forms in the build">
          {ids.length === 0 && <p className="text-xs text-lab-text-muted">No forms yet.</p>}
          <ul className="space-y-1">
            {ids.map((id) => <li key={id}><button onClick={() => setSel(id)} aria-current={sel === id ? 'true' : undefined} className={`w-full text-left px-2 py-1 rounded text-xs ${sel === id ? 'bg-lab-fda-soft text-lab-fda' : 'hover:bg-lab-panel-strong'}`}><span className="font-mono">{id}</span> {b.forms[id].name}</button></li>)}
          </ul>
        </Panel>
        {p!.start !== 'blank' && libLeft.length > 0 && (
          <Panel title="CDASH form library" sub="Standard forms with CDASHIG v2.3 variables. Add one, then adjust it to the protocol.">
            <ul className="space-y-2">
              {libLeft.map((id) => <li key={id} className="text-xs"><div className="flex justify-between gap-2"><span><span className="font-mono">{id}</span> {LIBRARY[id].name}</span><Btn tone="grey" onClick={() => { if (act((x) => addLibraryForm(x, id))) setSel(id) }}>Add</Btn></div><p className="text-lab-text-muted">{LIBRARY_NOTE[id]}</p></li>)}
            </ul>
          </Panel>
        )}
        <Panel title="New form">
          <div className="space-y-2">
            <label className="text-xs text-lab-text-muted block">Form ID<input className={ic('')} value={nf.id} onChange={(e) => setNf({ ...nf, id: e.target.value.toUpperCase() })} placeholder="e.g. PE" /></label>
            <label className="text-xs text-lab-text-muted block">Name<input className={ic('')} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="Physical examination" /></label>
            <label className="text-xs text-lab-text-muted block">SDTM domain<input className={ic('')} value={nf.domain} onChange={(e) => setNf({ ...nf, domain: e.target.value.toUpperCase() })} placeholder="PE" /></label>
            <Btn tone="grey" disabled={!nf.id || !nf.name || !nf.domain} onClick={() => { if (act((x) => addBlankForm(x, nf.id, nf.name, nf.domain))) { setSel(nf.id); setNf({ id: '', name: '', domain: '' }) } }}>Create</Btn>
          </div>
        </Panel>
      </div>
      {form ? <FormEditor key={form.id} form={form} /> : <Panel title="No form selected"><p className="text-sm text-lab-text-muted">Add forms from the library or create one.</p></Panel>}
    </div>
  )
}

function FormEditor({ form }: { form: FormDef }) {
  const { p, act } = useStore()
  const b = p!.build
  const [nf, setNf] = useState<Field>({ id: '', label: '', type: 'text' })
  const codelists = [{ value: '', label: '(none)' }, ...Object.keys(b.codelists).map((k) => ({ value: k, label: k }))]
  const at = b.visits.filter((v) => v.forms.includes(form.id)).map((v) => v.id)
  const set = (id: string, patch: Partial<Field>) => act((x) => setField(x, form.id, id, patch))
  const ccg = (b.ccg.forms[form.id] ?? []).join('\n')
  return (
    <div className="space-y-4">
      <Panel title={`${form.id}: ${form.name}`} sub={p!.logForms.includes(form.id) ? 'Log form: collected at any time.' : at.length ? `Collected at ${at.join(', ')}.` : 'Not on any visit yet (Schedule).'}
        right={<Btn tone="red" onClick={() => { if (confirm(`Remove ${form.id} and its edit checks?`)) act((x) => removeForm(x, form.id)) }}>Remove form</Btn>}>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-xs text-lab-text-muted">Name<input className={ic('')} value={form.name} onChange={(e) => act((x) => setForm(x, form.id, { name: e.target.value }))} /></label>
          <label className="text-xs text-lab-text-muted">SDTM domain<input className={ic('')} value={form.domain} onChange={(e) => act((x) => setForm(x, form.id, { domain: e.target.value.toUpperCase() }))} /></label>
          <label className="flex items-center gap-2 text-xs text-lab-text mt-5"><input type="checkbox" checked={!!form.repeating} onChange={(e) => act((x) => setForm(x, form.id, { repeating: e.target.checked }))} /> Repeating (several records per visit or subject)</label>
        </div>
        <Table head={['', 'Variable', 'Label (question)', 'Type', 'Unit', 'Codelist', 'Req.', 'CTQ', 'Derived', 'Show if', '']}
          rows={form.fields.map((f, i) => [
            <div className="flex flex-col"><button aria-label={`Move ${f.id} up`} disabled={i === 0} onClick={() => act((x) => moveField(x, form.id, f.id, -1))} className="text-lab-text-muted disabled:opacity-30">▲</button><button aria-label={`Move ${f.id} down`} disabled={i === form.fields.length - 1} onClick={() => act((x) => moveField(x, form.id, f.id, 1))} className="text-lab-text-muted disabled:opacity-30">▼</button></div>,
            <span className="font-mono">{f.id}</span>,
            <input aria-label={`${f.id} label`} className={ic('min-w-48')} value={f.label} onChange={(e) => set(f.id, { label: e.target.value })} />,
            <Select aria-label={`${f.id} type`} className="w-24" value={f.type} onChange={(e) => set(f.id, { type: e.target.value as FieldType })} options={TYPES.map((t) => ({ value: t, label: t === 'yn' ? 'yes/no' : t }))} />,
            <input aria-label={`${f.id} unit`} className={ic('w-20')} value={f.unit ?? ''} onChange={(e) => set(f.id, { unit: e.target.value })} />,
            <Select aria-label={`${f.id} codelist`} className="w-28" value={f.codelist ?? ''} onChange={(e) => set(f.id, { codelist: e.target.value })} options={codelists} />,
            <input type="checkbox" aria-label={`${f.id} required`} checked={!!f.required} onChange={(e) => set(f.id, { required: e.target.checked || undefined })} />,
            <input type="checkbox" aria-label={`${f.id} critical to quality`} checked={!!f.ctq} onChange={(e) => set(f.id, { ctq: e.target.checked || undefined })} />,
            <input type="checkbox" aria-label={`${f.id} derived`} checked={!!f.derived} onChange={(e) => set(f.id, { derived: e.target.checked || undefined })} />,
            <ShowIf form={form} f={f} onChange={(v) => set(f.id, { showIf: v })} />,
            <Btn tone="grey" onClick={() => act((x) => removeField(x, form.id, f.id))}>Remove</Btn>,
          ])} empty="No fields yet." />
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-lab-text-muted">Variable<input className={ic('w-28')} value={nf.id} onChange={(e) => setNf({ ...nf, id: e.target.value.toUpperCase() })} placeholder="PEDAT" /></label>
          <label className="text-xs text-lab-text-muted">Label<input className={ic('w-64')} value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} placeholder="Date of examination" /></label>
          <label className="text-xs text-lab-text-muted">Type<Select className="w-24" value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value as FieldType })} options={TYPES.map((t) => ({ value: t, label: t === 'yn' ? 'yes/no' : t }))} /></label>
          <Btn tone="grey" disabled={!nf.id || !nf.label} onClick={() => { if (act((x) => addField(x, form.id, { ...nf, ...(nf.type === 'yn' ? { codelist: 'NY' } : {}) }))) setNf({ id: '', label: '', type: 'text' }) }}>Add field</Btn>
        </div>
        <p className="text-xs text-lab-text-muted">CTQ: critical to quality (targeted source data verification). Derived fields are calculated by the system, not entered.</p>
      </Panel>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Preview" sub="The form as a site user sees it. Show-if fields appear when their condition is met.">
          <Preview form={form} />
        </Panel>
        <Panel title="CRF completion guidelines" sub="Form-level instructions for sites, one per line.">
          <TextArea aria-label="Completion guidelines" value={ccg} onChange={(e) => act((x) => { x.build.ccg.forms[form.id] = e.target.value.split('\n'); touched(x, `Completion guidelines for ${form.id} changed`) })} className="min-h-40" />
        </Panel>
      </div>
    </div>
  )
}

function ShowIf({ form, f, onChange }: { form: FormDef; f: Field; onChange: (v: Field['showIf']) => void }) {
  const opts = [{ value: '', label: 'always' }, { value: '__visit', label: 'visit is' }, ...form.fields.filter((x) => x.id !== f.id).map((x) => ({ value: x.id, label: `${x.id} =` }))]
  return (
    <div className="flex gap-1">
      <Select aria-label={`${f.id} show if`} className="w-28" value={f.showIf?.field ?? ''} onChange={(e) => onChange(e.target.value ? { field: e.target.value, equals: f.showIf?.equals ?? 'Y' } : undefined)} options={opts} />
      {f.showIf && <input aria-label={`${f.id} show if value`} className={ic('w-20')} value={f.showIf.equals} onChange={(e) => onChange({ field: f.showIf!.field, equals: e.target.value })} />}
    </div>
  )
}

function Preview({ form }: { form: FormDef }) {
  const { p } = useStore()
  const b = p!.build
  const [vals, setVals] = useState<Record<string, string>>({})
  const [visit, setVisit] = useState(b.visits.find((v) => v.forms.includes(form.id))?.id ?? b.visits[0]?.id ?? '')
  const shown = (f: Field) => !f.showIf || (f.showIf.field === '__visit' ? visit === f.showIf.equals : vals[f.showIf.field] === f.showIf.equals)
  return (
    <div className="space-y-2">
      {b.visits.length > 0 && <label className="text-xs text-lab-text-muted">Visit<Select className="w-48" value={visit} onChange={(e) => setVisit(e.target.value)} options={b.visits.map((v) => ({ value: v.id, label: v.name }))} /></label>}
      <div className="rounded border border-lab-line bg-white/95 text-slate-900 p-3 space-y-2">
        <p className="font-semibold text-sm">{form.name}</p>
        {form.fields.filter(shown).map((f) => (
          <label key={f.id} className="grid grid-cols-[1fr_12rem] items-center gap-2 text-xs">
            <span>{f.label}{f.required && <span className="text-red-700"> *</span>}{f.derived && <span className="text-slate-500"> (calculated)</span>}</span>
            {f.derived ? <span className="text-slate-500">—</span>
              : f.type === 'select' || f.type === 'yn' ? <select className="border border-slate-400 rounded px-1 py-0.5 bg-white" value={vals[f.id] ?? ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })}><option value="">Select…</option>{(b.codelists[f.codelist ?? ''] ?? []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
              : <span className="flex items-center gap-1"><input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} className="border border-slate-400 rounded px-1 py-0.5 w-full bg-white" value={vals[f.id] ?? ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} />{f.unit && <span className="text-slate-600">{f.unit}</span>}</span>}
          </label>
        ))}
        {!form.fields.length && <p className="text-xs text-slate-500">No fields.</p>}
      </div>
      <p className="text-xs text-lab-text-muted">{form.fields.filter((f) => f.ctq).map((f) => <Pill key={f.id} tone="amber" className="mr-1">CTQ {f.id}</Pill>)}</p>
    </div>
  )
}
