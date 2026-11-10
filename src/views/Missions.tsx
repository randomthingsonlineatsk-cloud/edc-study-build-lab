import { useState } from 'react'
import { useStore } from '../state'
import { MISSIONS, startMission, grade, submitMission, type Level } from '../domain/missions'
import { Btn, Panel, Pill, Select, Table, fmtUtc } from './ui'

const LEVELS: { value: Level; label: string }[] = [
  { value: 'guided', label: 'Guided: goals and hints shown' },
  { value: 'standard', label: 'Standard: goals shown, no hints' },
  { value: 'expert', label: 'Expert: goals shown only after you submit' },
]

// The missions panel on the home page.
export default function Missions() {
  const { projects, open } = useStore()
  const [level, setLevel] = useState<Level>('guided')
  const done = projects.filter((p) => p.mission)
  return (
    <Panel title="Missions" sub="Set tasks with a grade. The grade looks at the build itself and re-tests fixed checks with hidden test cases, so changing a test's expected result does not count as a fix.">
      <label className="text-xs text-lab-text-muted block max-w-sm">Level<Select value={level} onChange={(e) => setLevel(e.target.value as Level)} options={LEVELS} /></label>
      <div className="grid md:grid-cols-3 gap-3">
        {MISSIONS.map((m) => (
          <div key={m.id} className="rounded border border-lab-line bg-lab-panel-strong/50 p-3 space-y-2 flex flex-col">
            <h3 className="font-mono text-xs text-lab-text"><Pill tone="purple" className="mr-1">{m.id}</Pill>{m.title}</h3>
            <p className="text-xs text-lab-text-muted flex-1">{m.brief}</p>
            <Btn tone="solid" onClick={() => open(startMission(m.id, level))}>Start {m.id}</Btn>
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <Table head={['Mission', 'Level', 'Started', 'Result', '']} rows={done.map((p) => {
          const g = grade(p)
          return [p.name, p.mission!.level, fmtUtc(p.mission!.startedUtc), p.mission!.endedUtc ? <Pill tone={(p.mission!.score ?? 0) >= 80 ? 'green' : 'amber'}>Submitted: {p.mission!.score}%</Pill> : <span className="text-lab-text-muted">In progress{p.mission!.level !== 'expert' && g ? ` (${g.score}% so far)` : ''}</span>, <Btn onClick={() => open(p)}>Open</Btn>]
        })} />
      )}
    </Panel>
  )
}

// The mission bar above each page of a mission build.
export function MissionBar() {
  const { p, act } = useStore()
  const [show, setShow] = useState(false)
  const g = p ? grade(p) : null
  if (!p || !g) return null
  const m = p.mission!
  const ended = !!m.endedUtc
  const goalsShown = m.level !== 'expert' || ended
  return (
    <div className="mb-4 rounded border border-lab-purple/50 bg-lab-panel p-3 space-y-2" aria-label="Mission">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="purple">{g.mission.id}</Pill><span className="text-sm text-lab-text">{g.mission.title}</span><Pill>{m.level}</Pill>
        {ended ? <Pill tone={(m.score ?? 0) >= 80 ? 'green' : 'amber'}>Submitted: {m.score}%{(m.score ?? 0) >= 80 ? ', passed' : ', not yet passed'}</Pill> : goalsShown && <Pill tone="blue">{g.score}% so far</Pill>}
        <span className="flex-1" />
        {goalsShown && <Btn tone="grey" onClick={() => setShow(!show)}>{show ? 'Hide goals' : `Show goals (${g.results.filter((r) => r.ok).length} of ${g.results.length} met)`}</Btn>}
        {!ended && <Btn tone="solid" onClick={() => act((x) => { submitMission(x) })}>Submit for grading</Btn>}
      </div>
      <p className="text-xs text-lab-text-muted">{g.mission.brief}</p>
      {goalsShown && show && (
        <ul className="text-xs space-y-1">
          {g.results.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span aria-label={r.ok ? 'Met' : 'Not met'} className={r.ok ? 'text-lab-cdsco' : 'text-lab-text-muted'}>{r.ok ? '✓' : '○'}</span>
              <span className={r.ok ? 'text-lab-text' : 'text-lab-text-muted'}>{r.text} <span className="text-lab-text-muted">({r.weight} points)</span>{m.level === 'guided' && !r.ok && <span className="block text-lab-amber">Hint: {r.hint}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {ended && <p className="text-xs text-lab-text-muted">Submitted {fmtUtc(m.endedUtc)} UTC. You can keep working on this build; the grade above is the one submitted. Start the mission again for a new attempt.</p>}
    </div>
  )
}
