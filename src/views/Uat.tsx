import { useState } from 'react'
import { useStore } from '../state'
import { useNav } from '../App'
import { runUat, uatState, signUat, acceptIssue, buildHash, me, buildersOf, ROLE_LABEL } from '../domain/lab'
import Scripts from './Scripts'
import { uatReport } from '../domain/docs'
import { download } from '../domain/store'
import { Btn, Panel, Pill, SignForm, Stat, Table, TextArea, fmtUtc } from './ui'

// User acceptance testing: run every check's test cases against the build, log failures as
// issues, fix or accept them with a reason, write the summary and sign.
export default function Uat() {
  const { p, act } = useStore()
  const { go } = useNav()
  const u = uatState(p!)
  const failed = p!.uat.runs.filter((s) => s.actual !== s.expected)
  return (
    <div className="space-y-4">
      <Panel title="User acceptance testing" sub="UAT shows that each edit check does what the data validation specification says: every test case is run and its result recorded. A failure becomes an issue: fix the check (then run UAT again) or accept the issue with a reason. Any change to the build after sign-off withdraws the sign-off."
        right={<Btn tone="solid" onClick={() => act((x) => { runUat(x) })}>Run UAT</Btn>}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Test cases run" value={u.runs} /><Stat label="Failed" value={u.failed} tone={u.failed ? 'red' : u.runs ? 'green' : 'grey'} /><Stat label="Open issues" value={u.open} tone={u.open ? 'amber' : 'grey'} />
          <Stat label="Checks not tested" value={u.untested.length} tone={u.untested.length ? 'amber' : 'grey'} /><Stat label="Checks without both test types" value={u.fewTests.length} tone={u.fewTests.length ? 'amber' : 'grey'} />
        </div>
        {u.stale && <p className="text-xs text-lab-amber">The build changed since the last run: run the test cases again.</p>}
        <p className="text-xs text-lab-text-muted">Scripts: {u.scripts.passedSteps} of {u.scripts.totalSteps} steps passed on the current build{u.scripts.done ? ', all scripts complete' : ''}.</p>
        {u.fewTests.length > 0 && <p className="text-xs text-lab-amber">Give these checks a test case that fires and one that does not: {u.fewTests.join(', ')}.</p>}
        {u.untested.length > 0 && u.runs > 0 && <p className="text-xs text-lab-amber">Not in the last run (added since): {u.untested.join(', ')}. Run UAT again.</p>}
      </Panel>

      <Scripts />

      <Panel title="Issues" sub="A failed test case raises one issue per check; a failed or blocked script step raises one per step. The builder fixes the build; the tester re-tests.">
        <Table head={['Check', 'Issue', 'Status', 'Resolution', '']} empty="No issues yet." rows={p!.uat.issues.map((i) => [
          <button className="font-mono text-lab-fda underline" onClick={() => go('checks')}>{i.checkId}</button>, i.text,
          <Pill tone={i.status === 'open' ? 'red' : i.status === 'fixed' ? 'green' : 'amber'}>{i.status}</Pill>, i.resolution ?? '',
          i.status === 'open' ? <AcceptIssue id={i.id} /> : '',
        ])} />
      </Panel>

      {failed.length > 0 && (
        <Panel title="Failed test cases in the last run">
          <Table head={['Check', 'Test case', 'Expected', 'Actual']} rows={failed.map((s) => [s.checkId, s.test, s.expected ? 'Fires' : 'Passes', s.actual === 'error' ? 'Could not run' : s.actual ? 'Fired' : 'Did not fire'])} />
        </Panel>
      )}

      <Panel title="UAT summary and sign-off">
        <TextArea aria-label="UAT summary" placeholder="What was tested, by whom, the issues found and how each was resolved, and whether the build is fit for release." value={p!.uat.summary ?? ''} onChange={(e) => act((x) => { x.uat.summary = e.target.value })} />
        {p!.uat.signed && p!.uat.buildHash === buildHash(p!.build)
          ? <p className="text-sm text-lab-cdsco">Signed by {p!.uat.signed.name} ({p!.uat.signed.role}), {fmtUtc(p!.uat.signed.utc)} UTC: {p!.uat.signed.meaning}</p>
          : <SignForm key={me(p!).name} who={{ name: me(p!).name, role: ROLE_LABEL[me(p!).role] }} meaning="I approve the UAT results: the edit checks of this build work as specified." label="Sign UAT" disabled={!u.ready || me(p!).role !== 'tester'} onSign={(s) => act((x) => signUat(x, s))} />}
        {!u.ready && <p className="text-xs text-lab-text-muted">Sign-off opens when every active check has been run on this build with both test types, every script step has passed, no test fails and no issue is open.</p>}
        {me(p!).role !== 'tester' && <p className="text-xs text-lab-text-muted">Only the UAT tester signs. {buildersOf(p!).length ? `Changed this build version, so cannot sign: ${buildersOf(p!).join(', ')}.` : ''}</p>}
        <Btn tone="grey" disabled={!u.runs} onClick={() => download(`${p!.build.study.protocol}-uat-report.html`, uatReport(p!), 'text/html')}>Download the UAT report (HTML)</Btn>
      </Panel>
    </div>
  )
}

function AcceptIssue({ id }: { id: string }) {
  const { act } = useStore()
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState('')
  if (!open) return <Btn tone="grey" onClick={() => setOpen(true)}>Accept with a reason</Btn>
  return (
    <div className="space-y-1 w-64">
      <TextArea aria-label="Reason for accepting" className="min-h-12" placeholder="Why can this be accepted without a fix? For example: the test case was wrong and is corrected." value={why} onChange={(e) => setWhy(e.target.value)} />
      <div className="flex gap-1"><Btn tone="solid" disabled={!why.trim()} onClick={() => { if (act((x) => acceptIssue(x, id, why))) setOpen(false) }}>Accept</Btn><Btn tone="grey" onClick={() => setOpen(false)}>Cancel</Btn></div>
    </div>
  )
}
