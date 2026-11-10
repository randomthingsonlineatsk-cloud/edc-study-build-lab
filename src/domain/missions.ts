// Missions: set tasks with a grade. The grade looks at the build itself, not at what the learner
// says was done, and it re-tests fixed checks with the specification's own test cases, so a check
// cannot be "fixed" by changing its expected results.
import { createProject, buildHash, uatState, buildersOf, type LabProject, type StartKind } from './lab'
import { createAmendProject, impactScore, historicImpact } from './amendment'
import { createFromUsdm } from './usdm'
import { AMENDMENT_EFFECTIVE } from './m11'
import { scriptState } from './scripts'
import { hash } from './util'
import { review } from './review'
import { runTest } from './engine'
import { CHECK_BUGS, freshChecks } from './checks'
import type { CheckTest } from './types'

export type Level = 'guided' | 'standard' | 'expert'
export interface Goal { id: string; text: string; hint: string; weight: number; met: (p: LabProject) => boolean }
export interface Mission { id: string; title: string; start: StartKind; brief: string; goals: Goal[] }

// Extra edge cases the grader adds to the specification's tests for the three faulty checks.
const HIDDEN: Record<string, CheckTest[]> = {
  'VS-09': [{ name: 'Equal values fire', values: { SYSBP: '90', DIABP: '90' }, fire: true }, { name: 'Lower diastolic passes', values: { SYSBP: '140', DIABP: '85' }, fire: false }],
  'LB-07': [{ name: '25 mmol/L passes', values: { GLUC: '25', GLUCU: 'mmol/L' }, fire: false }, { name: '31 mmol/L fires', values: { GLUC: '31', GLUCU: 'mmol/L' }, fire: true }, { name: '1.5 mmol/L fires', values: { GLUC: '1.5', GLUCU: 'mmol/L' }, fire: true }],
  'AE-11': [{ name: 'AE after consent passes', values: { AESTDAT: '2026-03-10' }, fire: false, ctx: { consent: '2026-03-01' } }, { name: 'AE before consent fires', values: { AESTDAT: '2026-02-20' }, fire: true, ctx: { consent: '2026-03-01' } }],
}
export function bugFixed(p: LabProject, id: string): boolean {
  const c = p.build.checks.find((x) => x.id === id)
  if (!c || !c.active) return false
  const spec = freshChecks().find((x) => x.id === id)?.tests ?? []
  try { return [...spec, ...HIDDEN[id]].every((t) => runTest(c, t) === t.fire) } catch { return false }
}

const visit = (p: LabProject, id: string) => p.build.visits.find((v) => v.id === id)
const has = (p: LabProject, v: string, f: string) => !!visit(p, v)?.forms.includes(f)
const covered = (p: LabProject, ids: string[]) => {
  const f = review(p).all
  return ids.every((id) => !f.some((x) => x.id === id))
}
const signedIndependently = (p: LabProject) => !!p.uat.signed && p.uat.buildHash === buildHash(p.build) && !buildersOf(p).some((b) => b.toLowerCase() === p.uat.signed!.name.toLowerCase())
const uatSigned = (p: LabProject) => signedIndependently(p) && !p.uat.signed!.partial?.length
const released = (p: LabProject) => p.releases.length > 0 && p.releases.at(-1)!.hash === buildHash(p.build)
const noHigh = (p: LabProject) => review(p).high === 0
const noMedium = (p: LabProject) => review(p).medium === 0
const acceptedOnly = (p: LabProject) => !p.uat.issues.some((i) => i.status === 'accepted' && Object.keys(CHECK_BUGS).includes(i.checkId) && !bugFixed(p, i.checkId))

// Does any active check on FORM.FIELD fire for these values (union of the learner's checks)?
function anyFires(p: LabProject, form: string, field: string, t: CheckTest): boolean {
  return p.build.checks.some((c) => c.active && c.form === form && c.field === field && (!c.visits || c.visits.includes(t.ctx?.vis ?? 'W12')) && runTest(c, t) === true)
}
const E = AMENDMENT_EFFECTIVE
const kCase = (k: string, date: string, vis: string) => ({ name: '', values: { K: k, LBDAT: date, GLUCU: 'mmol/L' }, fire: true, ctx: { vis } })
export const potassiumRuleOk = (p: LabProject) =>
  anyFires(p, 'LB', 'K', kCase('5.2', '2026-09-20', 'W12')) && anyFires(p, 'LB', 'K', kCase('5.0', E, 'W12')) && !anyFires(p, 'LB', 'K', kCase('4.9', '2026-09-20', 'W12'))
  && !anyFires(p, 'LB', 'K', kCase('5.2', '2026-08-20', 'W4')) && anyFires(p, 'LB', 'K', kCase('5.6', '2026-08-20', 'W4')) && !anyFires(p, 'LB', 'K', kCase('5.2', '2026-09-20', 'SCR'))
const mgCase = (mg: string, date: string) => ({ name: '', values: { MG: mg, LBDAT: date, K: '4.5' }, fire: true, ctx: { vis: 'W12' } })
export const magnesiumRuleOk = (p: LabProject) => anyFires(p, 'LB', 'MG', mgCase('', '2026-09-20')) && !anyFires(p, 'LB', 'MG', mgCase('', '2026-08-20')) && !anyFires(p, 'LB', 'MG', mgCase('0.8', '2026-09-20'))

const BUG_GOALS: Goal[] = [
  { id: 'bug-vs09', text: 'VS-09 (diastolic not lower than systolic) works to its specification', hint: 'Run UAT: the "equal values" test fails. The specification says "not lower than", so equal values must fire.', weight: 10, met: (p) => bugFixed(p, 'VS-09') },
  { id: 'bug-lb07', text: 'LB-07 (glucose in mmol/L out of range) works to its specification', hint: 'Compare the upper limit in the logic with the title.', weight: 10, met: (p) => bugFixed(p, 'LB-07') },
  { id: 'bug-ae11', text: 'AE-11 (AE before consent) works to its specification', hint: 'days(a, b) is b minus a. Which date should come first?', weight: 10, met: (p) => bugFixed(p, 'AE-11') },
]

export const MISSIONS: Mission[] = [
  {
    id: 'M1', title: 'Fix the draft build and release 1.0', start: 'draft',
    brief: 'The console runs build 0.1. Bring it in line with the protocol: the schedule, the forms, the criteria list and the checks. Fix the three faulty edit checks, pass UAT and release version 1.0.',
    goals: [
      { id: 'w8', text: 'The W8 visit window matches the protocol', hint: 'Protocol section 1.3: Week 8 is study day 50 to 64.', weight: 8, met: (p) => visit(p, 'W8')?.lo === 50 && visit(p, 'W8')?.hi === 64 },
      { id: 'eg-w4', text: 'The ECG form is collected at W4', hint: 'The schedule of activities ticks the 12-lead ECG at Week 4.', weight: 8, met: (p) => has(p, 'W4', 'EG') },
      { id: 'preg', text: 'A pregnancy test form is collected at SCR, D1 and W12', hint: 'Add the PREG form from the library and tick it in the schedule.', weight: 12, met: (p) => !!p.build.forms.PREG && ['SCR', 'D1', 'W12'].every((v) => has(p, v, 'PREG')) },
      { id: 'ex04', text: 'Exclusion EX04 can be recorded and is checked', hint: 'Add EX04 to the IETEST codelist, then write a cross-form check on CM.', weight: 12, met: (p) => covered(p, ['P-crit-EX04', 'K-N-EX04']) },
      ...BUG_GOALS,
      { id: 'clean', text: 'The build review has no High or Medium findings', hint: 'Open the build review and work down the list.', weight: 10, met: (p) => noHigh(p) && noMedium(p) },
      { id: 'uat', text: 'UAT is signed on the final build, without accepting a faulty check', hint: 'An issue on a faulty check needs a fix, not an acceptance.', weight: 10, met: (p) => uatSigned(p) && acceptedOnly(p) },
      { id: 'rel', text: 'Version 1.0 or later is released', hint: 'Release with notes that say what changed.', weight: 10, met: (p) => released(p) && Number(p.build.study.buildVersion) >= 1 },
    ],
  },
  {
    id: 'M2', title: 'Build the study from the protocol', start: 'library',
    brief: 'Start from nothing but the protocol. Create the visits from the schedule of activities, add and place the forms, program the edit checks the protocol calls for (each with a firing and a passing test case), pass UAT and release. The console must be able to import your file.',
    goals: [
      { id: 'visits', text: 'Every visit in the schedule of activities exists, with its window', hint: 'Schedule: "Create visits from the protocol" does the first pass.', weight: 15, met: (p) => !review(p).all.some((f) => f.id.startsWith('P-visit-') || f.id.startsWith('P-window-')) },
      { id: 'forms', text: 'Every procedure in the schedule has a form at the right visits', hint: 'Use the protocol view: its ticks turn green when the build collects them.', weight: 20, met: (p) => !review(p).all.some((f) => f.id.startsWith('P-form-') || f.id.startsWith('P-miss-')) },
      { id: 'console', text: 'The console will import the file', hint: 'Keep the visit and form IDs the console\'s sites enter.', weight: 15, met: (p) => !review(p).all.some((f) => f.area === 'console' && f.sev === 'High') },
      { id: 'checks', text: 'Every check the protocol calls for is programmed', hint: 'Edit checks: the coverage table at the top.', weight: 20, met: (p) => !review(p).all.some((f) => f.id.startsWith('K-N-')) },
      { id: 'uat', text: 'UAT is signed on the final build', hint: 'Every active check needs a test case that fires and one that does not.', weight: 15, met: uatSigned },
      { id: 'rel', text: 'The build is released', hint: 'Release from the last page.', weight: 15, met: released },
    ],
  },
  {
    id: 'M3', title: 'UAT: find the three faulty checks', start: 'draft',
    brief: 'A targeted round of testing on the draft. Three edit checks do not match their specification. As the tester, run the test cases and the scripts; raise the failures; as the builder, correct the logic (not the expected result); re-test until they pass. The draft has no pregnancy form and cannot record EX04 yet, so this round leaves scripts S5 and S6 out of scope, with the reason, and ends in a partial UAT sign-off. Fixing the window and the ECG visit makes S1 pass too.',
    goals: [
      ...BUG_GOALS.map((g) => ({ ...g, weight: 15 })),
      { id: 'scripts', text: 'Scripts S2, S3 and S4 executed and passed on the corrected build', hint: 'UAT: scripted testing. Each script enters a test patient through the eCRF.', weight: 20, met: (p) => ['S2', 'S3', 'S4'].every((id) => scriptState(p).rows.find((r) => r.id === id)?.done && !scriptState(p).rows.find((r) => r.id === id)?.out) },
      { id: 'runs', text: 'All check test cases pass, and no issue on a faulty check was merely accepted', hint: 'Run UAT again after the fixes, as the tester.', weight: 15, met: (p) => { const u = uatState(p); return u.runs > 0 && u.failed === 0 && !u.stale && !p.uat.issues.some((i) => i.status === 'accepted' && !i.checkId.includes('.')) } },
      { id: 'partial', text: 'A partial UAT is signed by an independent tester with only S5 and S6 out of scope, each with a reason', hint: 'In each blocked script choose "Out of scope for this round", name S5 and S6 in the summary, then sign.', weight: 20, met: (p) => signedIndependently(p) && (p.uat.signed!.partial ?? []).join(',') === 'S5,S6' },
    ],
  },
  {
    id: 'M4', title: 'Protocol amendment after go-live', start: 'amend',
    brief: 'Build 1.0 is in production and sites have entered data. Amendment 3 adds a Week 6 safety visit, serum magnesium and a lower potassium threshold from its effective date. Assess the impact, build 1.1, re-test what the change touches, check what the new build does to the data already entered, and release.',
    goals: [
      { id: 'impact', text: 'Impact assessment: at least 4 of 5 answers right', hint: 'Open the Amendment page; every answer is in the amendment text.', weight: 15, met: (p) => impactScore(p).right >= 4 },
      { id: 'w6', text: 'Week 6 exists with window 40 to 44, SV and LB, before Week 8', hint: 'Schedule: add W6 (target day 42); the order follows the target day.', weight: 10, met: (p) => { const v = p.build.visits.find((x) => x.id === 'W6'); const i = p.build.visits.findIndex((x) => x.id === 'W6'); return !!v && v.lo === 40 && v.hi === 44 && v.forms.includes('SV') && v.forms.includes('LB') && i < p.build.visits.findIndex((x) => x.id === 'W8') } },
      { id: 'wincheck', text: 'The visit-window check runs at Week 6', hint: 'SV-04 lists the visits it runs at.', weight: 5, met: (p) => !review(p).all.some((f) => f.id === 'P-wincheck-W6') },
      { id: 'mg', text: 'Magnesium (MG, number, mmol/L) is on LB, and LB is at SCR, W4, W6 and W12', hint: 'Forms: add a field to LB.', weight: 10, met: (p) => { const f = p.build.forms.LB?.fields.find((x) => x.id === 'MG'); return !!f && f.type === 'number' && /mmol/i.test(f.unit ?? '') && ['SCR', 'W4', 'W6', 'W12'].every((v) => has(p, v, 'LB')) } },
      { id: 'k', text: `Potassium: 5.0 mmol/L from ${AMENDMENT_EFFECTIVE}, 5.5 before (re-tested with hidden cases)`, hint: "Use the result date: days('2026-09-15', LBDAT) >= 0 means on or after the effective date.", weight: 15, met: potassiumRuleOk },
      { id: 'mgmiss', text: 'Missing magnesium is queried only for results from the effective date', hint: 'A conditional missing-value check on LB.MG.', weight: 10, met: magnesiumRuleOk },
      { id: 'history', text: 'No new site queries on data entered before the amendment', hint: 'The Amendment page shows what your build does to the data already entered.', weight: 10, met: (p) => historicImpact(p).newQueries.length === 0 },
      { id: 'uat', text: 'Regression UAT signed by an independent tester (scripts re-executed where the change touched them, S7 passed)', hint: 'UAT: scripts S1, S3 and S7 need running; the others keep their 1.0 results.', weight: 15, met: (p) => uatSigned(p) && scriptState(p).done },
      { id: 'rel', text: 'Version 1.1 or later released', hint: 'Release as the lead data manager.', weight: 10, met: (p) => released(p) && Number(p.build.study.buildVersion) > 1 },
    ],
  },
  {
    id: 'M5', title: 'Review the build generated from the digital protocol', start: 'usdm',
    brief: 'A generator drafted the build from the protocol held as USDM data. Read its automation report, find what it got wrong or left out, fix the build, program the checks it could not generate, pass UAT and release. The console must import the file.',
    goals: [
      { id: 'scr', text: 'The Screening window is days -28 to -1', hint: 'The generator read a "Before" timing as "After".', weight: 10, met: (p) => { const v = p.build.visits.find((x) => x.id === 'SCR'); return !!v && v.lo === -28 && v.hi === -1 } },
      { id: 'preg', text: 'The generic pregnancy form is replaced by the CDASH PREG form', hint: 'Remove F11 and add PREG from the library at SCR, D1 and W12.', weight: 10, met: (p) => !!p.build.forms.PREG && !p.build.forms.F11 && ['SCR', 'D1', 'W12'].every((v) => has(p, v, 'PREG')) },
      { id: 'log', text: 'AE and CM are log forms, not visit forms', hint: 'Forms or Schedule: make them log forms.', weight: 10, met: (p) => ['AE', 'CM'].every((f) => p.logForms.includes(f) && !p.build.visits.some((v) => v.forms.includes(f))) },
      { id: 'ops', text: 'An unscheduled visit and the deviations form exist', hint: 'The console needs UNS and DV; the protocol records deviations in the eCRF (11.10).', weight: 10, met: (p) => p.build.visits.some((v) => v.id === 'UNS') && !!p.build.forms.DV && p.logForms.includes('DV') },
      { id: 'checks', text: 'Every check the protocol calls for is programmed', hint: 'Edit checks: the coverage table.', weight: 20, met: (p) => !review(p).all.some((f) => f.id.startsWith('K-N-')) },
      { id: 'clean', text: 'No High findings, and the console will import the file', hint: 'Build review.', weight: 10, met: (p) => review(p).high === 0 },
      { id: 'uat', text: 'UAT (test cases and scripts) signed by an independent tester', hint: 'Switch to the tester to run and sign UAT.', weight: 15, met: (p) => uatSigned(p) && scriptState(p).done },
      { id: 'rel', text: 'The build is released', hint: 'Release as the lead data manager.', weight: 15, met: released },
    ],
  },

]

export const missionOf = (p: LabProject) => MISSIONS.find((m) => m.id === p.mission?.id)

export function startMission(id: string, level: Level): LabProject {
  const m = MISSIONS.find((x) => x.id === id)!
  const name = `Mission ${m.id}: ${m.title}`
  const p = m.start === 'amend' ? createAmendProject(name) : m.start === 'usdm' ? createFromUsdm(undefined, name) : createProject(m.start, { name })
  p.mission = { id, level, startedUtc: new Date().toISOString() }
  return p
}

export function grade(p: LabProject) {
  const m = missionOf(p)
  if (!m) return null
  const results = m.goals.map((g) => { let ok = false; try { ok = g.met(p) } catch { ok = false } return { ...g, ok } })
  const total = results.reduce((s, g) => s + g.weight, 0)
  const score = Math.round((100 * results.filter((g) => g.ok).reduce((s, g) => s + g.weight, 0)) / total)
  return { mission: m, results, score, passed: score >= 80 && results.filter((g) => !g.ok).every((g) => g.weight < 15), uat: uatState(p) }
}

export function submitMission(p: LabProject) {
  const g = grade(p)
  if (!g) throw new Error('This build is not a mission.')
  p.mission!.endedUtc = new Date().toISOString()
  p.mission!.score = g.score
  p.mission!.detail = g.results.map((r) => `${r.ok ? 'Met' : 'Not met'}: ${r.text}`)
  p.history.push({ utc: p.mission!.endedUtc, what: `Mission ${g.mission.id} submitted: ${g.score}%` })
  return g
}

// ---------- certificate ----------
// Five missions passed (80% or more, submitted). The verification code is cyrb53 of the basis,
// as in the CDM console and the SDTM trainer, so the pharmolecule Passport can recompute it.
export const CERT_NEEDED = MISSIONS.length
export function bestRuns(projects: LabProject[]) {
  return MISSIONS.map((m) => projects.filter((p) => p.mission?.id === m.id && p.mission.endedUtc && (p.mission.score ?? 0) >= 80).sort((a, b) => (b.mission!.score ?? 0) - (a.mission!.score ?? 0))[0]).map((p, i) => ({ id: MISSIONS[i].id, title: MISSIONS[i].title, p }))
}
export function certificate(projects: LabProject[], userId: string, name: string) {
  const runs = bestRuns(projects)
  const passed = runs.filter((r) => r.p)
  const basis = `${name.trim().toLowerCase()}|${passed.map((r) => `${r.id}:${r.p!.mission!.score}:${r.p!.mission!.level}`).join(',')}|${userId}`
  const h = hash(basis).slice(-10).toUpperCase()
  const expert = passed.filter((r) => r.p!.mission!.level === 'expert').length
  return { eligible: passed.length >= CERT_NEEDED, runs, basis, code: `EDC-${h.slice(0, 5)}-${h.slice(5)}`, distinction: passed.length >= CERT_NEEDED && expert >= 3 }
}
