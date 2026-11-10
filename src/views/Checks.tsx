import { useMemo, useState } from 'react'
import { useStore } from '../state'
import { addCheck, setCheck, removeCheck, nextCheckId, missingCheck, checkErrors, CONTEXT_HELP, T } from '../domain/lab'
import { neededChecks } from '../domain/review'
import { runTest } from '../domain/engine'
import { CATEGORY_LABEL } from '../domain/checks'
import type { Check, CheckCategory, CheckTest } from '../domain/types'
import { Btn, Panel, Pill, Select, Table, TextArea, ic } from './ui'

// key=value; key=value  <->  record
const toPairs = (r: Record<string, string> = {}) => Object.entries(r).map(([k, v]) => `${k}=${v}`).join('; ')
const fromPairs = (s: string): Record<string, string> => Object.fromEntries(s.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return i < 0 ? [x, ''] : [x.slice(0, i).trim(), x.slice(i + 1).trim()] }))

// The data validation specification: every edit check with its logic, query text and tests.
export default function Checks() {
  const { p, act, tick } = useStore()
  const b = p!.build
  const [sel, setSel] = useState<string>(b.checks[0]?.id ?? '')
  const [filter, setFilter] = useState('')
  const [nc, setNc] = useState({ form: Object.keys(b.forms)[0] ?? '', field: '' })
  const need = useMemo(() => neededChecks(p!), [p, tick])
  const list = b.checks.filter((c) => !filter || c.form === filter)
  const check = b.checks.find((c) => c.id === sel)
  const create = (c: Check) => { if (act((x) => addCheck(x, c))) setSel(c.id) }
  const fieldOpts = (b.forms[nc.form]?.fields ?? []).map((f) => ({ value: f.id, label: `${f.id} ${f.label}` }))
  return (
    <div className="space-y-4">
      <Panel title="Edit checks the protocol calls for" sub="Each line is covered when an active check targets it. Write the missing ones; every check needs a test case that fires and one that does not.">
        <Table head={['Need', 'Source', 'Covered by']} rows={need.map((n) => [n.text, n.ref, n.covered.length ? n.covered.map((c) => <button key={c} className="mr-1" onClick={() => setSel(c)}><Pill tone="green">{c}</Pill></button>) : <Pill tone="red">Not covered</Pill>])} />
      </Panel>

      <div className="grid lg:grid-cols-[18rem_1fr] gap-4">
        <div className="space-y-3">
          <Panel title={`Checks (${b.checks.length})`}>
            <Select aria-label="Filter by form" value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: '', label: 'All forms' }, ...Object.keys(b.forms).map((f) => ({ value: f, label: f }))]} />
            <ul className="space-y-0.5 max-h-[28rem] overflow-y-auto">
              {list.map((c) => {
                const err = checkErrors(b, c)
                const bad = !err && c.tests.some((t) => runTest(c, t) !== t.fire)
                return <li key={c.id}><button onClick={() => setSel(c.id)} aria-current={sel === c.id ? 'true' : undefined} className={`w-full text-left px-2 py-1 rounded text-xs ${sel === c.id ? 'bg-lab-fda-soft text-lab-fda' : 'hover:bg-lab-panel-strong'}`}><span className="font-mono">{c.id}</span> {c.title}{!c.active && <span className="text-lab-text-muted"> (inactive)</span>}{(err || bad) && <span className="text-lab-red"> ●</span>}</button></li>
              })}
            </ul>
          </Panel>
          <Panel title="New check">
            <label className="text-xs text-lab-text-muted block">Form<Select value={nc.form} onChange={(e) => setNc({ form: e.target.value, field: '' })} options={Object.keys(b.forms).map((f) => ({ value: f, label: f }))} /></label>
            <label className="text-xs text-lab-text-muted block">Target field<Select value={nc.field} onChange={(e) => setNc({ ...nc, field: e.target.value })} options={[{ value: '', label: 'Choose…' }, ...fieldOpts]} /></label>
            <div className="flex flex-wrap gap-2">
              <Btn tone="grey" disabled={!nc.field} onClick={() => create(missingCheck(p!, nc.form, nc.field))}>Missing-value check</Btn>
              <Btn tone="grey" disabled={!nc.field} onClick={() => create({ id: nextCheckId(p!, nc.form), title: '', category: 'range', action: 'query', form: nc.form, field: nc.field, expr: '', message: '', tests: [T('Fires', {}, true), T('Passes', {}, false)], active: true })}>Blank check</Btn>
            </div>
          </Panel>
        </div>
        {check ? <CheckEditor key={check.id} c={check} onRemoved={() => setSel('')} /> : <Panel title="No check selected"><p className="text-sm text-lab-text-muted">Pick a check or create one.</p></Panel>}
      </div>
    </div>
  )
}

function CheckEditor({ c, onRemoved }: { c: Check; onRemoved: () => void }) {
  const { p, act } = useStore()
  const b = p!.build
  const set = (patch: Partial<Check>) => act((x) => setCheck(x, c.id, patch))
  const err = checkErrors(b, c)
  const fields = b.forms[c.form]?.fields ?? []
  const setTest = (i: number, patch: Partial<CheckTest>) => set({ tests: c.tests.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  return (
    <div className="space-y-4">
      <Panel title={`${c.id}: ${c.title || '(untitled)'}`} sub={`On ${c.form}.${c.field}: a query lands on this field when the logic is true.`} right={<Btn tone="red" onClick={() => { act((x) => removeCheck(x, c.id)); onRemoved() }}>Delete check</Btn>}>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-xs text-lab-text-muted">Title<input className={ic('')} value={c.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="text-xs text-lab-text-muted">Category<Select value={c.category} onChange={(e) => set({ category: e.target.value as CheckCategory })} options={Object.entries(CATEGORY_LABEL).map(([k, v]) => ({ value: k, label: v }))} /></label>
          <label className="text-xs text-lab-text-muted">Target field<Select value={c.field} onChange={(e) => set({ field: e.target.value })} options={fields.map((f) => ({ value: f.id, label: f.id }))} /></label>
          <label className="text-xs text-lab-text-muted">Only at visits (blank: every visit the form is on)<input className={ic('font-mono')} value={(c.visits ?? []).join(', ')} onChange={(e) => { const v = e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean); set({ visits: v.length ? v : undefined }) }} placeholder="SCR, W12" /></label>
        </div>
        <label className="text-xs text-lab-text-muted block">Logic (fires when true)<TextArea className="font-mono min-h-16" value={c.expr} onChange={(e) => set({ expr: e.target.value })} spellCheck={false} /></label>
        {err ? <p role="status" className="text-xs text-lab-red">{err}</p> : <p role="status" className="text-xs text-lab-cdsco">The logic parses.</p>}
        <label className="text-xs text-lab-text-muted block">Query text (neutral: say what is wrong, ask the site to check the source; {'{FIELD}'} inserts a value)<TextArea className="min-h-16" value={c.message} onChange={(e) => set({ message: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-xs text-lab-text"><input type="checkbox" checked={c.active} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
        <details className="text-xs text-lab-text-muted"><summary className="cursor-pointer text-lab-text">The check language</summary>
          <p className="mt-1">Fields of this form by name: {fields.map((f) => f.id).join(', ')}. Operators = != &lt; &lt;= &gt; &gt;= + - * /, and, or, not, x in ('A', 'B'). Comparisons with a blank are false, so a range check does not fire on a missing value (that is the missing check's job).</p>
          <p className="mt-1">Functions: present(x), isblank(x), any(...), all(...), abs, round, isnum, isdate, days(a, b) (b minus a), year(x), len, contains(text, word), upper, pattern(x, 'K####').</p>
          <ul className="mt-1 list-disc ml-5">{Object.values(CONTEXT_HELP).map((h) => <li key={h} className="font-mono">{h}</li>)}</ul>
        </details>
      </Panel>
      <Panel title="Test cases" sub="Values: FIELD=value; FIELD=value. Context for functions: rand=2026-03-01; consent=…; visdat:SCR=…; val:SCR|IE|IEYN=Y; winlo=26; winhi=32; today=…">
        <Table head={['Name', 'Field values', 'Context', 'Expected', 'Result', '']} rows={c.tests.map((t, i) => {
          const r = err ? 'error' : runTest(c, t)
          return [
            <input aria-label={`Test ${i + 1} name`} className={ic('w-36')} value={t.name} onChange={(e) => setTest(i, { name: e.target.value })} />,
            <input aria-label={`Test ${i + 1} values`} className={ic('w-56 font-mono')} defaultValue={toPairs(t.values)} onBlur={(e) => setTest(i, { values: fromPairs(e.target.value) })} />,
            <input aria-label={`Test ${i + 1} context`} className={ic('w-48 font-mono')} defaultValue={toPairs(t.ctx)} onBlur={(e) => { const v = fromPairs(e.target.value); setTest(i, { ctx: Object.keys(v).length ? v : undefined }) }} />,
            <Select aria-label={`Test ${i + 1} expected`} className="w-24" value={t.fire ? 'fire' : 'pass'} onChange={(e) => setTest(i, { fire: e.target.value === 'fire' })} options={[{ value: 'fire', label: 'Fires' }, { value: 'pass', label: 'Passes' }]} />,
            r === 'error' ? <Pill tone="red">Error</Pill> : r === t.fire ? <Pill tone="green">As expected</Pill> : <Pill tone="red">{r ? 'Fired' : 'Did not fire'}</Pill>,
            <Btn tone="grey" onClick={() => set({ tests: c.tests.filter((_, j) => j !== i) })}>Remove</Btn>,
          ]
        })} />
        <Btn tone="grey" onClick={() => set({ tests: [...c.tests, T(`Test ${c.tests.length + 1}`, {}, true)] })}>Add a test case</Btn>
      </Panel>
    </div>
  )
}
