import { M11, PROTOCOL_FINDINGS, protocolOf } from '../domain/m11'
import { useStore } from '../state'
import { Panel, Pill, Table } from './ui'

// The protocol, read-only, in the ICH M11 structure: what the build must collect.
export default function Protocol() {
  const { p } = useStore()
  const b = p!.build
  const pr0 = protocolOf(p!)
  const visits = pr0.visits
  const formAt = (form: string, visit: string) => b.visits.find((v) => v.id === visit)?.forms.includes(form)
  return (
    <div className="space-y-4">
      {pr0.amendment && <Panel title={`In force: protocol version ${pr0.version} (amendment 3)`} sub={pr0.amendment.summary}><ul className="list-disc ml-5 text-xs text-lab-text space-y-1">{pr0.amendment.changes.map((c) => <li key={c.id}><b>{c.section}:</b> {c.text}</li>)}</ul></Panel>}
      <Panel title="Protocol HLV-204-201: title page and design" sub={M11.version}>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {Object.entries({ ...M11.title, ...M11.design }).map(([k, v]) => <div key={k} className="flex gap-2 border-b border-lab-line/50 py-1"><span className="text-lab-text-muted w-56 shrink-0">{k}</span><span className="text-lab-text">{v}</span></div>)}
        </div>
      </Panel>

      <Panel title="1.3 Schedule of activities" sub="Each procedure, the form that collects it and its visits. A tick shows the build already has the form at that visit.">
        <Table head={['Procedure', 'Section', 'Form', 'Fields', ...visits.map((v) => <span key={v.id} title={`${v.name}: study day ${v.lo} to ${v.hi}`}>{v.id}<br /><span className="normal-case">{v.lo}..{v.hi}</span></span>)]}
          rows={pr0.procedures.map((pr) => [
            <span>{pr.name}{pr.note && <span className="block text-lab-text-muted">{pr.note}</span>}</span>, pr.section, <span className="font-mono">{pr.form}</span>, <span className="font-mono text-[10px]">{pr.fields.join(', ')}</span>,
            ...visits.map((v) => (pr.visits === 'continuous' ? <span className="text-lab-text-muted">log</span> : pr.visits.includes(v.id) ? (formAt(pr.form, v.id) ? <span className="text-lab-cdsco" aria-label="scheduled and built">✓</span> : <span className="text-lab-amber" aria-label="scheduled, not built yet">●</span>) : '')),
          ])} />
        <p className="text-xs text-lab-text-muted">● scheduled, not in the build yet · ✓ scheduled and built · log: collected throughout on a log form</p>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="5.2 Inclusion and 5.3 exclusion criteria">
          <Table head={['Code', 'Criterion']} rows={[...pr0.inclusion, ...pr0.exclusion].map((c) => [<span className="font-mono">{c.code}</span>, c.text])} />
        </Panel>
        <Panel title="3 Objectives, endpoints and estimands">
          <Table head={['Section', 'Kind', 'Endpoint']} rows={M11.objectives.map((o) => [o.section, <Pill tone={o.kind === 'Primary' ? 'blue' : 'grey'}>{o.kind}</Pill>, o.endpoint])} />
        </Panel>
      </div>

      <Panel title="Other statements the build must respect" sub="Read the protocol as a whole: some statements sit outside the schedule, and some disagree with each other.">
        <Table head={['Section', 'Statement']} rows={pr0.statements.map((s) => [s.section, s.text])} />
        <details className="text-xs text-lab-text-muted"><summary className="cursor-pointer text-lab-text">Inconsistencies a careful builder raises with the protocol author</summary>
          <ul className="list-disc ml-5 mt-2 space-y-1">{PROTOCOL_FINDINGS.map((f) => <li key={f.id}><b>{f.where}:</b> {f.text}</li>)}</ul>
          <p className="mt-2">The build cannot resolve these alone: it follows the protocol once the author clarifies or amends it.</p>
        </details>
      </Panel>
    </div>
  )
}
