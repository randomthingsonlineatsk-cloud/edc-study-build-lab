import { useState } from 'react'
import { useStore } from '../state'
import { scriptsFor, stepState, executeStep, resetPatient, pageQueries, pageProblem, UAT_TODAY, type Script, type ScriptStep, type StepState } from '../domain/scripts'
import type { Field } from '../domain/study'
import { Btn, Panel, Pill, Table, TextArea } from './ui'

const TONE: Record<StepState, 'green' | 'red' | 'amber' | 'grey'> = { pass: 'green', fail: 'red', blocked: 'red', deviation: 'amber', retest: 'amber', 'not run': 'grey' }

// Scripted UAT: enter test patients through the eCRF and record what the page does.
export default function Scripts() {
  const { p } = useStore()
  const list = scriptsFor(p!)
  const [sid, setSid] = useState(list[0].id)
  const s = list.find((x) => x.id === sid) ?? list[0]
  return (
    <Panel title="Scripted testing on the eCRF" sub={`The UAT plan's scripts. Each enters a test patient through the forms, step by step, as a site would; the tester records whether the queries the script expects appear on the page. Test date ${UAT_TODAY}. Set-up steps put the patient in place; a script's result stays valid until the forms, checks or visits it tests change.`}>
      <div className="flex flex-wrap gap-1">
        {list.map((x) => {
          const st = x.steps.map((y) => stepState(p!, x, y.id).state)
          const done = st.every((y) => y === 'pass'), bad = st.some((y) => y === 'fail' || y === 'blocked')
          return <Btn key={x.id} tone={x.id === sid ? 'solid' : done ? 'green' : bad ? 'red' : 'grey'} onClick={() => setSid(x.id)}>{x.id} {done ? '✓' : `${st.filter((y) => y === 'pass').length}/${st.length}`}</Btn>
        })}
      </div>
      <ScriptView key={s.id} s={s} />
    </Panel>
  )
}

function ScriptView({ s }: { s: Script }) {
  const { p, act } = useStore()
  const states = s.steps.map((x) => stepState(p!, s, x.id))
  const next = s.steps.findIndex((_, i) => states[i].state !== 'pass')
  const [cur, setCur] = useState(Math.max(0, next))
  const st = s.steps[cur]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-xs text-lab-text">{s.id} {s.title}</h3><Pill>{s.ref}</Pill><Pill tone="purple">Test patient {s.patient}</Pill>
        <span className="flex-1" />
        <Btn tone="grey" onClick={() => { if (act((x) => resetPatient(x, s))) setCur(0) }}>Reset the test patient</Btn>
      </div>
      <Table head={['Step', 'Instruction', 'Expected', 'Result', '']} rows={s.steps.map((x, i) => [
        <span className="font-mono">{x.id}</span>,
        <span className={x.setup ? 'text-lab-text-muted' : ''}>{x.instruction} <span className="font-mono text-[10px] text-lab-text-muted">({x.visit === 'LOG' ? 'log' : x.visit} · {x.form})</span></span>,
        <span className="text-[11px]">{x.expect.query?.length ? <>Query on {x.expect.query.join(', ')}</> : null}{x.expect.query?.length && x.expect.none?.length ? '; ' : ''}{x.expect.none?.length ? <>no query on {x.expect.none.join(', ')}</> : null}</span>,
        <span><Pill tone={TONE[states[i].state]}>{states[i].state}</Pill>{states[i].result && <span className="block text-[10px] text-lab-text-muted">{states[i].result!.detail} {states[i].result!.by}, {states[i].result!.utc.slice(0, 10)}</span>}</span>,
        <Btn tone={i === cur ? 'solid' : 'grey'} onClick={() => setCur(i)}>Open</Btn>,
      ])} />
      {st && <StepPage key={`${s.id}-${st.id}`} s={s} st={st} onDone={() => setCur(Math.min(cur + 1, s.steps.length - 1))} />}
    </div>
  )
}

// The eCRF page for one step: the tester types the scripted data and saves.
function StepPage({ s, st, onDone }: { s: Script; st: ScriptStep; onDone: () => void }) {
  const { p, act } = useStore()
  const b = p!.build
  const form = b.forms[st.form]
  const prior = p!.uat.patients?.[s.patient]?.find((e) => e.visit === st.visit && e.form === st.form && e.inst === (st.inst ?? 1))
  const [vals, setVals] = useState<Record<string, string>>(prior?.values ?? {})
  const [comment, setComment] = useState('')
  const problem = pageProblem(p!, st.visit, st.form)
  const shown = (f: Field) => !f.showIf || (f.showIf.field === '__visit' ? st.visit === f.showIf.equals : vals[f.showIf.field] === f.showIf.equals)
  const queries = prior ? pageQueries(b, p!.uat.patients?.[s.patient] ?? [], st.visit, st.form, st.inst ?? 1) : []
  return (
    <div className="grid lg:grid-cols-[1fr_20rem] gap-3">
      <div className="space-y-2">
        <p className="text-xs text-lab-text"><b>Step {st.id}:</b> {st.instruction}</p>
        {problem ? <p role="status" className="text-xs text-lab-red">Blocked: {problem} Executing the step records it as blocked and raises an issue.</p> : (
          <div className="rounded border border-lab-line bg-white/95 text-slate-900 p-3 space-y-2">
            <p className="font-semibold text-sm">{s.patient} · {st.visit === 'LOG' ? 'Log' : b.visits.find((v) => v.id === st.visit)?.name} · {form.name}{st.inst && st.inst > 1 ? ` #${st.inst}` : ''}</p>
            {form.fields.filter(shown).map((f) => {
              const q = queries.filter((x) => x.field === f.id)
              return (
                <div key={f.id} className={`grid grid-cols-[1fr_12rem] items-center gap-2 text-xs ${q.length ? 'bg-amber-100 rounded px-1' : ''}`}>
                  <label htmlFor={`f-${f.id}`}>{f.label}{f.required && <span className="text-red-700"> *</span>}</label>
                  {f.derived ? <span className="text-slate-500">(calculated)</span>
                    : f.type === 'select' || f.type === 'yn' ? <select id={`f-${f.id}`} className="border border-slate-400 rounded px-1 py-0.5 bg-white" value={vals[f.id] ?? ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })}><option value="">Select…</option>{(b.codelists[f.codelist ?? ''] ?? []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
                    : <span className="flex items-center gap-1"><input id={`f-${f.id}`} type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} className="border border-slate-400 rounded px-1 py-0.5 w-full bg-white" value={vals[f.id] ?? ''} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} />{f.unit && <span className="text-slate-600">{f.unit}</span>}</span>}
                  {q.map((x) => <p key={x.checkId} className="col-span-2 text-[11px] text-amber-900">Query {x.checkId}: {x.text}</p>)}
                </div>
              )
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!problem && <Btn tone="grey" onClick={() => setVals({ ...st.values })}>Fill in the scripted data</Btn>}
          <Btn tone="solid" onClick={() => { if (act((x) => { executeStep(x, s.id, st.id, problem ? {} : vals, comment) })) { setComment(''); const r = p!.uat.scripts?.find((y) => y.scriptId === s.id && y.stepId === st.id); if (r?.status === 'pass') onDone() } }}>{problem ? 'Record as blocked' : 'Save page and record the result'}</Btn>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-lab-text-muted">Expected: {st.expect.query?.length ? `a query on ${st.expect.query.join(', ')}` : ''}{st.expect.query?.length && st.expect.none?.length ? '; ' : ''}{st.expect.none?.length ? `no query on ${st.expect.none.join(', ')}` : ''}.</p>
        <p className="text-xs text-lab-text-muted">Queries now on this page: {prior ? (queries.length ? queries.map((q) => q.checkId).join(', ') : 'none') : 'page not saved yet'}.</p>
        <TextArea aria-label="Tester comment" className="min-h-14" placeholder="Comment (optional): what you saw, a screenshot reference." value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
    </div>
  )
}
