// Scripted UAT: the tester enters test patients through the eCRF, step by step, following
// written test scripts, and records whether the queries the script expects appear on the page.
// This is the part of UAT that test cases on single checks cannot cover: visit windows from the
// build, cross-form checks, show-if fields and what the site actually sees.
//
// Each result is kept with the "scope" it tested (the forms, visits and checks the script
// touches). After a later build change, results whose scope did not change stay valid; the rest
// must be executed again. That is regression testing scoped by impact.
import { parse, evaluate, truth, type Ctx, type Val } from './expr'
import { interpolate } from './engine'
import { hash } from './util'
import { me, needRole, log, type LabProject, type StudyBuild, type CasebookEntry, type ScriptResult } from './lab'
import { AMENDMENT_EFFECTIVE } from './m11'

export const UAT_TODAY = '2026-10-01'
export interface Expect { query?: string[]; none?: string[] }   // FORM.FIELD that must / must not carry a query
export interface ScriptStep { id: string; visit: string; form: string; inst?: number; instruction: string; values: Record<string, string>; expect: Expect; setup?: boolean }
export interface Script { id: string; title: string; ref: string; patient: string; steps: ScriptStep[]; amendment?: boolean }

// Set-up steps put the test patient in place; the script's scope is the steps it is written to test.
const SV = (visit: string, date: string, id: string): ScriptStep => ({ id, visit, form: 'SV', instruction: `Set-up: record visit ${visit} as done on ${date}.`, values: { VISOCCUR: 'Y', VISDAT: date }, expect: { none: ['SV.VISDAT'] }, setup: true })
const IC = (date: string, id: string): ScriptStep => ({ id, visit: 'SCR', form: 'IC', instruction: `Set-up: record informed consent signed on ${date}, version v2.0.`, values: { DSSTDAT: date, ICVER: 'v2.0' }, expect: { none: ['IC.DSSTDAT'] }, setup: true })
const vs = (date: string, sys: string, dia: string) => ({ VSDAT: date, SYSBP: sys, DIABP: dia, PULSE: '72', WEIGHT: '82' })

// The UAT plan's scripts, written by the lead data manager from the protocol and the data
// validation specification. They name fields, not check IDs, so they test any build of the study.
export const SCRIPTS: Script[] = [
  { id: 'S1', title: 'Visit windows follow the protocol', ref: 'M11 1.3', patient: 'TP-101', steps: [
    IC('2026-03-02', '1'), SV('SCR', '2026-03-03', '2'), SV('D1', '2026-03-20', '3'),
    { id: '4', visit: 'W4', form: 'SV', instruction: 'Record Week 4 on 2026-04-30 (study day 42, outside days 26 to 32).', values: { VISOCCUR: 'Y', VISDAT: '2026-04-30' }, expect: { query: ['SV.VISDAT'] } },
    { id: '5', visit: 'W4', form: 'SV', instruction: 'Correct the Week 4 date to 2026-04-16 (study day 28).', values: { VISOCCUR: 'Y', VISDAT: '2026-04-16' }, expect: { none: ['SV.VISDAT'] } },
    { id: '6', visit: 'W8', form: 'SV', instruction: 'Record Week 8 on 2026-05-21 (study day 63, inside the protocol window of days 50 to 64).', values: { VISOCCUR: 'Y', VISDAT: '2026-05-21' }, expect: { none: ['SV.VISDAT'] } },
  ] },
  { id: 'S2', title: 'Blood pressure plausibility', ref: 'M11 8.4.2', patient: 'TP-102', steps: [
    IC('2026-03-02', '1'), SV('SCR', '2026-03-03', '2'), SV('D1', '2026-03-20', '3'), SV('W4', '2026-04-16', '4'),
    { id: '5', visit: 'W4', form: 'VS', instruction: 'Enter Week 4 vital signs with systolic 120 and diastolic 120 mmHg (equal values).', values: vs('2026-04-16', '120', '120'), expect: { query: ['VS.DIABP'] } },
    { id: '6', visit: 'W4', form: 'VS', instruction: 'Correct diastolic to 80 mmHg.', values: vs('2026-04-16', '120', '80'), expect: { none: ['VS.DIABP', 'VS.SYSBP'] } },
    { id: '7', visit: 'W4', form: 'VS', instruction: 'Enter systolic 1200 mmHg (a typing error for 120).', values: vs('2026-04-16', '1200', '80'), expect: { query: ['VS.SYSBP'] } },
  ] },
  { id: 'S3', title: 'Glucose in mmol/L', ref: 'M11 8.4.4', patient: 'TP-103', steps: [
    IC('2026-03-02', '1'), SV('SCR', '2026-03-03', '2'),
    { id: '3', visit: 'SCR', form: 'LB', instruction: 'Enter screening laboratory results with glucose 25 mmol/L (high but possible).', values: { LBDAT: '2026-03-03', GLUC: '25', GLUCU: 'mmol/L', K: '4.4', CREAT: '80', ALT: '22' }, expect: { none: ['LB.GLUC'] } },
    { id: '4', visit: 'SCR', form: 'LB', instruction: 'Change glucose to 31 mmol/L.', values: { LBDAT: '2026-03-03', GLUC: '31', GLUCU: 'mmol/L', K: '4.4', CREAT: '80', ALT: '22' }, expect: { query: ['LB.GLUC'] } },
  ] },
  { id: 'S4', title: 'Adverse event dates against consent', ref: 'M11 9.2.1', patient: 'TP-104', steps: [
    IC('2026-03-02', '1'), SV('SCR', '2026-03-03', '2'),
    { id: '3', visit: 'LOG', form: 'AE', inst: 1, instruction: 'Add an adverse event "Headache" starting 2026-02-20, before consent.', values: { AETERM: 'Headache', AESTDAT: '2026-02-20', AEONGO: 'Y', AESEV: 'MILD', AESER: 'N', AEREL: 'NOT RELATED', AEACN: 'DOSE NOT CHANGED', AEOUT: 'NOT RECOVERED/NOT RESOLVED' }, expect: { query: ['AE.AESTDAT'] } },
    { id: '4', visit: 'LOG', form: 'AE', inst: 1, instruction: 'Correct the start date to 2026-03-10.', values: { AETERM: 'Headache', AESTDAT: '2026-03-10', AEONGO: 'Y', AESEV: 'MILD', AESER: 'N', AEREL: 'NOT RELATED', AEACN: 'DOSE NOT CHANGED', AEOUT: 'NOT RECOVERED/NOT RESOLVED' }, expect: { none: ['AE.AESTDAT'] } },
  ] },
  { id: 'S5', title: 'Pregnancy test', ref: 'M11 8.4.5', patient: 'TP-105', steps: [
    IC('2026-03-02', '1'), SV('SCR', '2026-03-03', '2'),
    { id: '3', visit: 'SCR', form: 'PREG', instruction: 'Record a participant of childbearing potential with a serum test on 2026-03-03 and no result yet.', values: { PREGCBP: 'Y', PREGDAT: '2026-03-03', PREGTYP: 'SERUM' }, expect: { query: ['PREG.PREGRES'] } },
    { id: '4', visit: 'SCR', form: 'PREG', instruction: 'Enter the result Positive.', values: { PREGCBP: 'Y', PREGDAT: '2026-03-03', PREGTYP: 'SERUM', PREGRES: 'POSITIVE' }, expect: { query: ['PREG.PREGRES'] } },
    { id: '5', visit: 'SCR', form: 'PREG', instruction: 'Correct the result to Negative.', values: { PREGCBP: 'Y', PREGDAT: '2026-03-03', PREGTYP: 'SERUM', PREGRES: 'NEGATIVE' }, expect: { none: ['PREG.PREGRES'] } },
  ] },
  { id: 'S6', title: 'Exclusion EX04 from concomitant medications', ref: 'M11 5.3', patient: 'TP-106', steps: [
    IC('2026-03-02', '1'), SV('SCR', '2026-03-03', '2'),
    { id: '3', visit: 'SCR', form: 'IE', instruction: 'Record that all eligibility criteria are met.', values: { IEYN: 'Y' }, expect: { none: ['IE.IEYN'] } },
    { id: '4', visit: 'LOG', form: 'CM', inst: 1, instruction: 'Add spironolactone 25 mg once daily, ongoing, started 2025-11-01.', values: { CMTRT: 'Spironolactone', CMINDC: 'Hypertension', CMDSTXT: '25', CMDOSU: 'mg', CMROUTE: 'ORAL', CMSTDAT: '2025-11-01', CMONGO: 'Y' }, expect: { query: ['CM.CMTRT'] } },
    { id: '5', visit: 'LOG', form: 'CM', inst: 2, instruction: 'Add amlodipine 5 mg, ongoing, started 2025-06-01 (allowed).', values: { CMTRT: 'Amlodipine', CMINDC: 'Hypertension', CMDSTXT: '5', CMDOSU: 'mg', CMROUTE: 'ORAL', CMSTDAT: '2025-06-01', CMONGO: 'Y' }, expect: { none: ['CM.CMTRT'] } },
  ] },
  { id: 'S7', title: 'Amendment 3: Week 6, magnesium and the potassium threshold', ref: 'Amendment 3', patient: 'TP-107', amendment: true, steps: [
    IC('2026-06-05', '1'), SV('SCR', '2026-06-06', '2'), SV('D1', '2026-06-25', '3'), SV('W4', '2026-07-22', '4'),
    { id: '5', visit: 'W4', form: 'LB', instruction: `Enter Week 4 laboratory results dated 2026-07-22, before the amendment's effective date (${AMENDMENT_EFFECTIVE}): potassium 5.2 mmol/L, no magnesium.`, values: { LBDAT: '2026-07-22', GLUC: '5.4', GLUCU: 'mmol/L', K: '5.2', CREAT: '84', ALT: '24' }, expect: { none: ['LB.K', 'LB.MG'] } },
    { id: '6', visit: 'W6', form: 'SV', instruction: 'Record Week 6 on 2026-08-12 (study day 49, outside days 40 to 44).', values: { VISOCCUR: 'Y', VISDAT: '2026-08-12' }, expect: { query: ['SV.VISDAT'] } },
    { id: '6b', visit: 'W6', form: 'SV', instruction: 'Correct the Week 6 date to 2026-08-04 (study day 41).', values: { VISOCCUR: 'Y', VISDAT: '2026-08-04' }, expect: { none: ['SV.VISDAT'] } },
    { id: '7', visit: 'W6', form: 'LB', instruction: 'Enter Week 6 results dated 2026-08-04 (study day 41, still before the effective date): potassium 5.2 mmol/L, magnesium 0.8 mmol/L.', values: { LBDAT: '2026-08-04', GLUC: '5.3', GLUCU: 'mmol/L', K: '5.2', MG: '0.8', CREAT: '85', ALT: '25' }, expect: { none: ['LB.K', 'LB.MG'] } },
    SV('W8', '2026-08-20', '8'), SV('W12', '2026-09-17', '9'),
    { id: '10', visit: 'W12', form: 'LB', instruction: 'Enter Week 12 results dated 2026-09-17 (after the effective date): potassium 5.2 mmol/L and no magnesium.', values: { LBDAT: '2026-09-17', GLUC: '5.3', GLUCU: 'mmol/L', K: '5.2', CREAT: '85', ALT: '25' }, expect: { query: ['LB.K', 'LB.MG'] } },
  ] },
]
export const scriptsFor = (p: LabProject) => SCRIPTS.filter((s) => !s.amendment || p.protocol === 'A3')

// ---------- the casebook evaluator (uses the build's own visits and windows) ----------
function fnsFor(b: StudyBuild, entries: CasebookEntry[], visit: string): Record<string, (...a: Val[]) => Val> {
  const get = (v: string, f: string, x: string) => entries.find((e) => e.visit === v && e.form === f && e.inst === 1)?.values[x] ?? ''
  const visdat = (v: string) => (get(v, 'SV', 'VISOCCUR') === 'Y' ? get(v, 'SV', 'VISDAT') : '')
  const order = b.visits.filter((v) => v.id !== 'UNS')
  const win = b.visits.find((v) => v.id === visit)
  const prevIdx = () => order.findIndex((v) => v.id === visit)
  const aes = () => entries.filter((e) => e.form === 'AE')
  const eos = () => entries.find((e) => e.form === 'EOS')
  return {
    consent: () => entries.find((e) => e.form === 'IC')?.values.DSSTDAT ?? '', rand: () => visdat('D1'), visdat: (v) => visdat(String(v)),
    val: (v, f, x) => get(String(v), String(f), String(x)), vis: () => visit, today: () => UAT_TODAY, winlo: () => win?.lo ?? '', winhi: () => win?.hi ?? '',
    prevvisdat: () => { for (let j = prevIdx() - 1; j >= 0; j--) { const d = visdat(order[j].id); if (d) return d } return '' },
    lastvisdat: () => b.visits.map((v) => visdat(v.id)).filter(Boolean).sort().pop() ?? '',
    prevdisp: (x) => { for (let j = prevIdx() - 1; j >= 0; j--) if (get(order[j].id, 'EX', 'EXDISP') === 'Y') return get(order[j].id, 'EX', String(x)); return '' },
    prevdispdat: () => { for (let j = prevIdx() - 1; j >= 0; j--) if (get(order[j].id, 'EX', 'EXDISP') === 'Y') return visdat(order[j].id); return '' },
    eos: () => eos()?.values.DSDECOD ?? '', eosdat: () => eos()?.values.EOSDAT ?? '',
    aecount: (f, v) => aes().filter((a) => String(a.values[String(f)] ?? '').toUpperCase() === String(v).toUpperCase()).length,
    aematch: (t) => aes().filter((a) => String(a.values.AETERM ?? '').toUpperCase().includes(String(t).toUpperCase())).length,
  }
}
export interface PageQuery { checkId: string; field: string; text: string }
// The queries the build raises on one page of a test patient's casebook.
export function pageQueries(b: StudyBuild, entries: CasebookEntry[], visit: string, form: string, inst = 1): PageQuery[] {
  const e = entries.find((x) => x.visit === visit && x.form === form && x.inst === inst)
  if (!e) return []
  const fns = fnsFor(b, entries, visit)
  const ctx: Ctx = { get: (n) => (Object.hasOwn(e.values, n) ? e.values[n] : ''), fn: fns }
  const out: PageQuery[] = []
  for (const c of b.checks) {
    if (!c.active || c.form !== form || (c.visits && !c.visits.includes(visit))) continue
    let fired = false
    try { fired = truth(evaluate(parse(c.expr), ctx)) } catch { fired = false }
    if (fired) out.push({ checkId: c.id, field: c.field, text: interpolate(c.message, e.values, fns, visit) })
  }
  return out
}

// What a page can hold in this build: the visit must exist and carry the form (or it is a log form).
export function pageProblem(p: LabProject, visit: string, form: string): string {
  const b = p.build
  if (!b.forms[form]) return `The build has no ${form} form.`
  if (visit === 'LOG') return p.logForms.includes(form) ? '' : `${form} is not a log form in this build.`
  const v = b.visits.find((x) => x.id === visit)
  if (!v) return `The build has no ${visit} visit.`
  if (!v.forms.includes(form)) return `${form} is not on ${visit} in this build.`
  return ''
}

// The part of the build a script tests: its forms, their codelists and checks, and its visits.
export function scopeHash(b: StudyBuild, s: Script): string {
  const tested = s.steps.filter((x) => !x.setup)
  const forms = [...new Set(tested.map((x) => x.form))].sort()
  const visits = [...new Set(tested.map((x) => x.visit))].sort()
  const cls = new Set(forms.flatMap((f) => (b.forms[f]?.fields ?? []).map((x) => x.codelist).filter(Boolean) as string[]))
  return hash(JSON.stringify({
    forms: forms.map((f) => b.forms[f] ?? null), codelists: [...cls].sort().map((c) => b.codelists[c] ?? null),
    checks: b.checks.filter((c) => forms.includes(c.form) || forms.some((f) => c.expr.includes(`'${f}'`))).map((c) => [c.id, c.expr, c.active, c.visits ?? null, c.field, c.form]),
    visits: visits.map((v) => b.visits.find((x) => x.id === v) ?? null),
    // The visit order up to the last visit the script uses (it decides the previous visit).
    order: b.visits.slice(0, Math.max(...visits.map((v) => b.visits.findIndex((x) => x.id === v))) + 1).map((v) => v.id),
  }))
}

export function resetPatient(p: LabProject, s: Script) {
  needRole(p, 'tester', 'Running test scripts')
  p.uat.patients ??= {}; p.uat.patients[s.patient] = []
  p.uat.scripts = (p.uat.scripts ?? []).filter((r) => r.scriptId !== s.id)
  log(p, `Test patient ${s.patient} reset for script ${s.id}`)
}

// Enter one step's page for the test patient and record the result.
export function executeStep(p: LabProject, scriptId: string, stepId: string, values: Record<string, string>, comment = ''): ScriptResult {
  needRole(p, 'tester', 'Running test scripts')
  const s = SCRIPTS.find((x) => x.id === scriptId)!, st = s.steps.find((x) => x.id === stepId)!
  const inst = st.inst ?? 1
  const base: Omit<ScriptResult, 'status' | 'detail'> = { scriptId, stepId, comment: comment || undefined, by: me(p).name, utc: new Date().toISOString(), buildHash: scopeHash(p.build, s) }
  let r: ScriptResult
  const problem = pageProblem(p, st.visit, st.form)
  if (problem) r = { ...base, status: 'blocked', detail: problem }
  else {
    p.uat.patients ??= {}
    const cb = (p.uat.patients[s.patient] ??= [])
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''))
    const e = cb.find((x) => x.visit === st.visit && x.form === st.form && x.inst === inst)
    if (e) e.values = clean; else cb.push({ visit: st.visit, form: st.form, inst, values: clean })
    const off = Object.entries(st.values).filter(([k, v]) => (clean[k] ?? '') !== v).map(([k]) => k)
    const qs = pageQueries(p.build, cb, st.visit, st.form, inst)
    const on = (key: string) => qs.some((q) => `${st.form}.${q.field}` === key)
    const missing = (st.expect.query ?? []).filter((k) => !on(k)), extra = (st.expect.none ?? []).filter(on)
    if (off.length) r = { ...base, status: 'deviation', detail: `Entered values differ from the script for ${off.join(', ')}. Enter the scripted data, or write a script change first.` }
    else if (missing.length || extra.length) r = { ...base, status: 'fail', detail: [missing.length ? `expected a query on ${missing.join(', ')}, none appeared` : '', extra.length ? `no query was expected on ${extra.join(', ')}, but ${qs.filter((q) => extra.includes(`${st.form}.${q.field}`)).map((q) => q.checkId).join(', ')} fired` : ''].filter(Boolean).join('; ') }
    else r = { ...base, status: 'pass', detail: qs.length ? `Queries on the page: ${qs.map((q) => `${q.checkId} (${q.field})`).join(', ')}.` : 'No queries on the page.' }
  }
  p.uat.scripts = [...(p.uat.scripts ?? []).filter((x) => !(x.scriptId === scriptId && x.stepId === stepId)), r]
  const key = `${scriptId}.${stepId}`
  const open = p.uat.issues.find((i) => i.checkId === key && i.status === 'open')
  if ((r.status === 'fail' || r.status === 'blocked') && !open) p.uat.issues.push({ id: `U-${Date.now().toString(36)}-${key}`, checkId: key, text: `Script ${s.id} step ${st.id} (${s.title}): ${r.detail}`, status: 'open', utc: r.utc })
  if (r.status === 'pass' && open) { open.status = 'fixed'; open.resolution = `Re-executed: passed on ${r.utc.slice(0, 10)}.` }
  log(p, `Script ${s.id} step ${st.id}: ${r.status}`)
  return r
}

export type StepState = 'not run' | 'pass' | 'fail' | 'blocked' | 'deviation' | 'retest'
export function stepState(p: LabProject, s: Script, stepId: string): { state: StepState; result?: ScriptResult } {
  const r = (p.uat.scripts ?? []).find((x) => x.scriptId === s.id && x.stepId === stepId)
  if (!r) return { state: 'not run' }
  if (r.buildHash !== scopeHash(p.build, s)) return { state: 'retest', result: r }
  return { state: r.status, result: r }
}
export function scriptState(p: LabProject) {
  const rows = scriptsFor(p).map((s) => {
    const states = s.steps.map((x) => stepState(p, s, x.id).state)
    return { id: s.id, title: s.title, steps: states.length, passed: states.filter((x) => x === 'pass').length, retest: states.filter((x) => x === 'retest').length, failed: states.filter((x) => x === 'fail' || x === 'blocked').length, done: states.every((x) => x === 'pass') }
  })
  return { rows, done: rows.every((r) => r.done), passedSteps: rows.reduce((a, r) => a + r.passed, 0), totalSteps: rows.reduce((a, r) => a + r.steps, 0) }
}
