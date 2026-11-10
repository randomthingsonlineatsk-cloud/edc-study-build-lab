import { useStore } from '../state'
import { useNav } from '../App'
import { AMENDMENT_3 } from '../domain/m11'
import { IMPACT_QS, impactScore, historicImpact } from '../domain/amendment'
import { scriptState } from '../domain/scripts'
import { Btn, Panel, Pill, Stat, Table } from './ui'

// A protocol amendment after go-live: the change, the impact assessment, and what the new build
// does to the data already entered.
export default function Amendment() {
  const { p, act } = useStore()
  const { go } = useNav()
  const a = p!.impact ?? {}
  const sc = impactScore(p!)
  const ended = !!p!.mission?.endedUtc
  const showAnswers = ended || p!.mission?.level === 'guided'
  const h = historicImpact(p!)
  const ss = scriptState(p!)
  return (
    <div className="space-y-4">
      <Panel title={`Amendment 3: protocol version ${AMENDMENT_3.version}`} sub={AMENDMENT_3.summary}>
        <Table head={['Change', 'Section', 'What changes', 'Rationale']} rows={AMENDMENT_3.changes.map((c) => [<span className="font-mono">{c.id}</span>, c.section, c.text, <span className="text-lab-text-muted">{c.rationale}</span>])} />
        <p className="text-xs text-lab-text-muted">Build 1.0 has been in production since {p!.releases[0]?.utc.slice(0, 10) ?? 'release'}. The usual path for a mid-study change: impact assessment, build changes in a new version, UAT scoped by the impact (regression), release, and a check of what the new version does to data already entered.</p>
      </Panel>

      <Panel title="1. Impact assessment" sub={`Answered ${sc.answered} of ${sc.total}${showAnswers ? `; ${sc.right} right` : ''}. Answer before you build: the answers decide what you change and what you test again.`}>
        <div className="space-y-3">
          {IMPACT_QS.map((q) => (
            <fieldset key={q.id} className="rounded border border-lab-line p-3 space-y-1">
              <legend className="text-xs text-lab-text px-1"><span className="font-mono text-lab-text-muted mr-1">{q.id}</span>{q.q}</legend>
              {q.options.map((o) => (
                <label key={o.id} className="flex gap-2 text-xs text-lab-text items-start">
                  <input type="radio" name={q.id} checked={a[q.id] === o.id} disabled={ended} onChange={() => act((x) => { x.impact = { ...(x.impact ?? {}), [q.id]: o.id } })} className="mt-0.5" />
                  <span>{o.text}{showAnswers && a[q.id] && o.id === q.answer && <Pill tone="green" className="ml-1">Right</Pill>}</span>
                </label>
              ))}
              {showAnswers && a[q.id] && <p className="text-xs text-lab-text-muted">{a[q.id] === q.answer ? '' : 'Not this one. '}{q.why}</p>}
            </fieldset>
          ))}
        </div>
      </Panel>

      <Panel title="2. What the new build does to the data already entered" sub={`The production data: ${h.participants} participants and ${h.pages} laboratory pages entered under build 1.0. This compares the queries your build raises on those pages with what build 1.0 raised.`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Pages with new queries" value={h.pagesWithNew} tone={h.pagesWithNew ? 'red' : 'green'} />
          <Stat label="New queries on old data" value={h.newQueries.reduce((s, q) => s + q.n, 0)} tone={h.newQueries.length ? 'red' : 'green'} />
          <Stat label="Results 5.0 to 5.5 mmol/L (listing)" value={h.listing.length} tone="amber" />
          <Stat label="Already past Week 6" value={h.pastW6} />
        </div>
        {h.newQueries.length > 0 && <p className="text-xs text-lab-red">Your build would raise queries on data that were correct under the protocol when they were entered: {h.newQueries.map((q) => `${q.checkId} (${q.n})`).join(', ')}. Limit the new rules to results dated from the effective date.</p>}
        <details className="text-xs text-lab-text-muted"><summary className="cursor-pointer text-lab-text">The listing for the medical monitor (earlier results between 5.0 and 5.5 mmol/L)</summary>
          <Table head={['Participant', 'Visit', 'Date', 'Potassium (mmol/L)']} rows={h.listing.map((r) => [r.subj, r.visit, r.date, r.k])} />
        </details>
        <p className="text-xs text-lab-text-muted">Participants already past Week 6 on the effective date will never have it: that is not a missed visit. Say so in the completion guidelines for the LB and SV forms.</p>
      </Panel>

      <Panel title="3. Regression testing" sub="Scripts whose forms, checks and visits did not change keep their 1.0 results. The rest, and the new script S7, must be executed on the new build.">
        <Table head={['Script', 'Steps', 'Passed', 'To re-test', 'State']} rows={ss.rows.map((r) => [`${r.id} ${r.title}`, r.steps, r.passed, r.retest, r.done ? <Pill tone="green">Valid</Pill> : <Pill tone={r.retest ? 'amber' : 'red'}>{r.retest ? 'Re-test' : 'Open'}</Pill>])} />
        <div className="flex gap-2"><Btn tone="grey" onClick={() => go('schedule')}>Schedule</Btn><Btn tone="grey" onClick={() => go('checks')}>Edit checks</Btn><Btn tone="grey" onClick={() => go('uat')}>UAT</Btn></div>
      </Panel>
    </div>
  )
}
