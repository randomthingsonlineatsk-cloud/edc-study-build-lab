import { useStore } from '../state'
import { useNav } from '../App'
import { runUat, uatState, signUat, log, buildHash } from '../domain/lab'
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
        right={<Btn tone="solid" onClick={() => act((x) => { runUat(x, 'Practice tester') })}>Run UAT</Btn>}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Test cases run" value={u.runs} /><Stat label="Failed" value={u.failed} tone={u.failed ? 'red' : u.runs ? 'green' : 'grey'} /><Stat label="Open issues" value={u.open} tone={u.open ? 'amber' : 'grey'} />
          <Stat label="Checks not tested" value={u.untested.length} tone={u.untested.length ? 'amber' : 'grey'} /><Stat label="Checks without both test types" value={u.fewTests.length} tone={u.fewTests.length ? 'amber' : 'grey'} />
        </div>
        {u.fewTests.length > 0 && <p className="text-xs text-lab-amber">Give these checks a test case that fires and one that does not: {u.fewTests.join(', ')}.</p>}
        {u.untested.length > 0 && u.runs > 0 && <p className="text-xs text-lab-amber">Not in the last run (added since): {u.untested.join(', ')}. Run UAT again.</p>}
      </Panel>

      <Panel title="Issues" sub="Each failed test raises one issue per check.">
        <Table head={['Check', 'Issue', 'Status', 'Resolution', '']} empty="No issues yet." rows={p!.uat.issues.map((i) => [
          <button className="font-mono text-lab-fda underline" onClick={() => go('checks')}>{i.checkId}</button>, i.text,
          <Pill tone={i.status === 'open' ? 'red' : i.status === 'fixed' ? 'green' : 'amber'}>{i.status}</Pill>, i.resolution ?? '',
          i.status === 'open' ? <Btn tone="grey" onClick={() => { const why = prompt('Why can this issue be accepted without a fix? (for example: the test case was wrong and is corrected; or the behaviour is acceptable and documented)'); if (why?.trim()) act((x) => { const it = x.uat.issues.find((y) => y.id === i.id)!; it.status = 'accepted'; it.resolution = `Accepted: ${why.trim()}`; log(x, `UAT issue on ${i.checkId} accepted`) }) }}>Accept with a reason</Btn> : '',
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
          : <SignForm meaning="I approve the UAT results: the edit checks of this build work as specified." label="Sign UAT" disabled={!u.ready} onSign={(s) => act((x) => signUat(x, s))} />}
        {!u.ready && <p className="text-xs text-lab-text-muted">Sign-off opens when every active check has been run with both test types, no test fails and no issue is open.</p>}
        <Btn tone="grey" disabled={!u.runs} onClick={() => download(`${p!.build.study.protocol}-uat-report.html`, uatReport(p!), 'text/html')}>Download the UAT report (HTML)</Btn>
      </Panel>
    </div>
  )
}
