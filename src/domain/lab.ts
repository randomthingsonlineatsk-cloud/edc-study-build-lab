// The EDC Study Build Lab: a study build project. The learner builds the database for protocol
// HLV-204-201 (VASCLEAR-2) from its ICH M11 protocol: the visit schedule, the eCRF forms and
// fields, the codelists, the edit checks with their test cases, the CRF completion guidelines,
// then user acceptance testing and release. The release is a cdm-study-build file that the CDM
// Query & Edit-Check Console imports (docs/study-build-format.md).
//
// Files shared with the console (kept in step): expr.ts (the edit-check language), engine.ts
// (test evaluation), checks.ts (the console's shipped edit checks), study.ts (the console's
// shipped build), dmp.ts (completion guidelines) and m11.ts (the protocol).

import { FORMS as REF_FORMS, VISITS as REF_VISITS, CODELISTS as REF_CODELISTS, LOG_FORMS as REF_LOG, type FormDef, type Visit, type Field } from './study'
import { SHIPPED_CHECKS, CTX_FNS, CHECK_BUGS } from './checks'
import { CCG_GENERAL, CCG_FORM, CCG_FIELD } from './dmp'
import { M11, protocolOf } from './m11'
import type { Check, CheckTest } from './types'
import { validate } from './expr'
import { runTest } from './engine'
import { scriptState } from './scripts'

export const BUILD_FORMAT = 'cdm-study-build'
export const PROTOCOL_ID = 'HLV-204-201'

export interface Codelist { value: string; label: string }
export interface StudyBuild {
  format: typeof BUILD_FORMAT; version: 1
  study: { protocol: string; title: string; buildVersion: string; source: string }
  visits: Visit[]
  forms: Record<string, FormDef>
  codelists: Record<string, Codelist[]>
  checks: Check[]
  ccg: { general: string[]; forms: Record<string, string[]>; fields?: Record<string, string> }
}

export interface Signature { name: string; role: string; meaning: string; utc: string; partial?: string[] }
export interface UatStep { checkId: string; test: string; expected: boolean; actual: boolean | 'error'; utc: string; by: string }
export interface UatIssue { id: string; checkId: string; text: string; status: 'open' | 'fixed' | 'accepted'; resolution?: string; utc: string }
export interface ScriptResult { scriptId: string; stepId: string; status: 'pass' | 'fail' | 'blocked' | 'deviation'; detail: string; comment?: string; by: string; utc: string; buildHash: string }
export interface CasebookEntry { visit: string; form: string; inst: number; values: Record<string, string> }
export interface Uat { runs: UatStep[]; issues: UatIssue[]; summary?: string; signed?: Signature; buildHash?: string; scripts?: ScriptResult[]; patients?: Record<string, CasebookEntry[]>; runBy?: string; runHash?: string; outOfScope?: OutOfScope[] }
// A script the UAT plan leaves out of this round of testing, with the reason. A sign-off with any
// script out of scope is a partial UAT: it records what was tested but cannot support a release.
export interface OutOfScope { scriptId: string; reason: string; by: string; utc: string }
export interface Release { version: string; utc: string; hash: string; signed: Signature; notes: string }

export type StartKind = 'blank' | 'library' | 'draft' | 'usdm' | 'amend'
// Roles: the builder changes the build, the tester runs and signs UAT, the lead data manager
// releases. ICH E6(R3) expects computerised systems to be validated with documented testing; in
// practice the person who tests and approves a build is not the person who programmed it.
export type Role = 'builder' | 'tester' | 'lead'
export interface Member { name: string; role: Role }
export const ROLE_LABEL: Record<Role, string> = { builder: 'Study builder', tester: 'UAT tester', lead: 'Lead data manager' }
export const ROLE_TEXT: Record<Role, string> = { builder: 'study builder', tester: 'UAT tester', lead: 'lead data manager' }
export const DEFAULT_TEAM: Member[] = [{ name: 'Priya Nair', role: 'builder' }, { name: 'Daniel Okafor', role: 'tester' }, { name: 'Mei Chen', role: 'lead' }]
export interface LabProject {
  schema: 1; id: string; name: string; userId: string; classId: string
  createdUtc: string; updatedUtc: string
  start: StartKind
  build: StudyBuild
  logForms: string[]          // subject-level repeating forms, collected at any time
  uat: Uat
  releases: Release[]
  history: { utc: string; what: string; by?: string; build?: boolean }[]
  team: Member[]; as: number
  protocol?: 'A3'             // the protocol version in force: absent = version 2.0, 'A3' = amendment 3
  automation?: string[]       // notes from the automated first-pass build (USDM start)
  impact?: Record<string, string> // the amendment impact assessment answers
  mission?: { id: string; startedUtc: string; level: 'guided' | 'standard' | 'expert'; endedUtc?: string; score?: number; detail?: string[] }
}

const now = () => new Date().toISOString()
const uid = (p = '') => `${p}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const clone = <T,>(x: T): T => structuredClone(x)

// ---------- the CDASH form library ----------
// Ready-made forms the learner can add and then adjust. They are the console's forms (CDASHIG
// v2.3 names) plus a pregnancy test form, which the console's shipped build lacks.
export const PREG_FORM: FormDef = {
  id: 'PREG', name: 'Pregnancy test', domain: 'LB', fields: [
    { id: 'PREGCBP', label: 'Is the participant of childbearing potential?', type: 'yn', codelist: 'NY', required: true },
    { id: 'PREGDAT', label: 'Date of the pregnancy test', type: 'date', showIf: { field: 'PREGCBP', equals: 'Y' } },
    { id: 'PREGTYP', label: 'Test type', type: 'select', codelist: 'PREGTYP', showIf: { field: 'PREGCBP', equals: 'Y' } },
    { id: 'PREGRES', label: 'Result', type: 'select', codelist: 'PREGRES', showIf: { field: 'PREGCBP', equals: 'Y' }, ctq: true },
  ],
}
export const LIBRARY_CODELISTS: Record<string, Codelist[]> = {
  ...clone(REF_CODELISTS),
  PREGRES: [{ value: 'NEGATIVE', label: 'Negative' }, { value: 'POSITIVE', label: 'Positive' }],
  PREGTYP: [{ value: 'SERUM', label: 'Serum' }, { value: 'URINE', label: 'Urine' }],
}
export const LIBRARY: Record<string, FormDef> = { ...clone(REF_FORMS), PREG: PREG_FORM }
export const LIBRARY_NOTE: Record<string, string> = {
  SV: 'Visit occurrence and date: every scheduled visit has it.', IC: 'Informed consent date and version.', DM: 'Demographics.', IE: 'Eligibility: met, or which criterion was not met.',
  MH: 'Medical history (repeating).', VS: 'Vital signs, weight, height and derived BMI.', LB: 'Local laboratory results.', LBC: 'Central laboratory sample collection (results come by transfer).',
  EG: '12-lead ECG.', EX: 'Study drug dispensing and accountability.', DV: 'Protocol deviations (log).', EOS: 'End of study status.', AE: 'Adverse events (log), with the SAE criteria.',
  CM: 'Concomitant medications (log).', PREG: 'Pregnancy test for participants of childbearing potential.',
}
const BASE_CODELISTS = ['NY']

// ---------- the reference build ----------
// What a correct build of the protocol looks like: the console's build with the gaps the
// protocol twin finds closed (pregnancy test, ECG at Week 4, the Week 8 window, criterion EX04).
export function referenceBuild(): StudyBuild {
  const b = consoleBuild()
  b.forms.PREG = clone(PREG_FORM)
  b.codelists.PREGRES = clone(LIBRARY_CODELISTS.PREGRES); b.codelists.PREGTYP = clone(LIBRARY_CODELISTS.PREGTYP)
  for (const v of b.visits) {
    if (['SCR', 'D1', 'W12'].includes(v.id)) v.forms.push('PREG')
    if (v.id === 'W4' && !v.forms.includes('EG')) v.forms.splice(v.forms.indexOf('EX'), 0, 'EG')
    if (v.id === 'W8') { v.lo = 50; v.hi = 64 }
  }
  b.codelists.IETEST.push({ value: 'EX04', label: 'EX04 Potassium-sparing diuretic or potassium supplement within 4 weeks' })
  for (const c of b.checks) if (CHECK_BUGS[c.id]) c.expr = CHECK_BUGS[c.id].correct
  const scr = { 'val:SCR|IE|IEYN': 'Y', 'visdat:SCR': '2026-03-02' }
  b.checks.push(
    { id: 'CM-20', title: 'Potassium-sparing diuretic or potassium supplement within 4 weeks before screening (EX04)', category: 'cross-form', action: 'query', form: 'CM', field: 'CMTRT',
      expr: "val('SCR', 'IE', 'IEYN') = 'Y' and (contains(CMTRT, 'SPIRONOLACTONE') or contains(CMTRT, 'EPLERENONE') or contains(CMTRT, 'AMILORIDE') or contains(CMTRT, 'TRIAMTERENE') or contains(CMTRT, 'POTASSIUM')) and present(visdat('SCR')) and (CMONGO = 'Y' or isblank(CMENDAT) or days(CMENDAT, visdat('SCR')) <= 28)",
      message: '{CMTRT} was taken within 4 weeks before screening, and eligibility is recorded as met (exclusion EX04). Please review eligibility and the medication dates.',
      tests: [T('Spironolactone ongoing fires', { CMTRT: 'Spironolactone 25 mg', CMONGO: 'Y' }, true, scr), T('Stopped 2 months before passes', { CMTRT: 'Spironolactone', CMONGO: 'N', CMENDAT: '2026-01-01' }, false, scr), T('Amlodipine passes', { CMTRT: 'Amlodipine', CMONGO: 'Y' }, false, scr)], active: true },
    { id: 'PREG-01', title: 'Pregnancy test result missing', category: 'missing', action: 'query', form: 'PREG', field: 'PREGRES', expr: "PREGCBP = 'Y' and isblank(PREGRES)", message: 'The participant is of childbearing potential, but no pregnancy test result is recorded. Please enter the result from the source, or record why the test was not done.', tests: [T('Blank fires', { PREGCBP: 'Y', PREGRES: '' }, true), T('Negative passes', { PREGCBP: 'Y', PREGRES: 'NEGATIVE' }, false)], active: true },
    { id: 'PREG-02', title: 'Positive pregnancy test', category: 'protocol', action: 'query', form: 'PREG', field: 'PREGRES', expr: "PREGCBP = 'Y' and PREGRES = 'POSITIVE'", message: 'A positive pregnancy test is recorded. Please confirm the result; the protocol requires dosing to stop and the pregnancy to be reported (section 8.4.5).', tests: [T('Positive fires', { PREGCBP: 'Y', PREGRES: 'POSITIVE' }, true), T('Negative passes', { PREGCBP: 'Y', PREGRES: 'NEGATIVE' }, false)], active: true },
  )
  b.study.source = 'EDC Study Build Lab (reference build)'
  return b
}

// The console's shipped build (the draft the console runs today, with the twin's gaps).
export function consoleBuild(): StudyBuild {
  return {
    format: BUILD_FORMAT, version: 1,
    study: { protocol: PROTOCOL_ID, title: M11.title['Full Title'], buildVersion: '1.0', source: 'CDM Query & Edit-Check Console (shipped build)' },
    visits: clone(REF_VISITS), forms: clone(REF_FORMS), codelists: clone(REF_CODELISTS), checks: clone(SHIPPED_CHECKS),
    ccg: { general: [...CCG_GENERAL], forms: clone(CCG_FORM), fields: { ...CCG_FIELD } },
  }
}

export function createProject(start: StartKind = 'library', opts: { name?: string; userId?: string; classId?: string } = {}): LabProject {
  const t = now()
  let build: StudyBuild
  if (start === 'draft') { build = consoleBuild(); build.study.source = 'EDC Study Build Lab'; build.study.buildVersion = '0.1' }
  else {
    build = {
      format: BUILD_FORMAT, version: 1,
      study: { protocol: PROTOCOL_ID, title: M11.title['Full Title'], buildVersion: '0.1', source: 'EDC Study Build Lab' },
      visits: [], forms: {}, codelists: Object.fromEntries(BASE_CODELISTS.map((k) => [k, clone(LIBRARY_CODELISTS[k])])), checks: [],
      ccg: { general: [...CCG_GENERAL], forms: {}, fields: {} },
    }
  }
  return {
    schema: 1, id: uid('b-'), name: opts.name ?? (start === 'draft' ? 'VASCLEAR-2 build (from the console draft)' : start === 'blank' ? 'VASCLEAR-2 build (blank)' : 'VASCLEAR-2 build'),
    userId: opts.userId ?? 'local', classId: opts.classId ?? '', createdUtc: t, updatedUtc: t, start,
    build, logForms: start === 'draft' ? [...REF_LOG] : [], uat: { runs: [], issues: [] }, releases: [], history: [{ utc: t, what: `Build started (${start})`, by: DEFAULT_TEAM[0].name, build: true }],
    team: clone(DEFAULT_TEAM), as: 0,
  }
}

// Projects saved by an earlier version get the fields added since.
export function upgrade(p: LabProject): LabProject {
  if (!Array.isArray(p.team) || !p.team.length) { p.team = clone(DEFAULT_TEAM); p.as = 0 }
  if (typeof p.as !== 'number' || !p.team[p.as]) p.as = 0
  return p
}
export const me = (p: LabProject): Member => p.team?.[p.as] ?? DEFAULT_TEAM[0]
export function needRole(p: LabProject, role: Role, what: string) {
  const m = me(p)
  if (m.role !== role) throw new Error(`${what} is for the ${ROLE_TEXT[role]}. You are working as ${m.name} (${ROLE_TEXT[m.role]}): switch roles in the header.`)
}
// Everyone who changed the build since it was last released (or since it started).
export function buildersOf(p: LabProject): string[] {
  const since = p.releases.at(-1)?.utc ?? ''
  return [...new Set(p.history.filter((h) => h.build && h.by && h.utc >= since).map((h) => h.by!))]
}
export function setTeam(p: LabProject, team: Member[]) {
  if (!team.length || team.some((m) => !m.name.trim())) throw new Error('Every team member needs a name.')
  for (const r of ['builder', 'tester', 'lead'] as Role[]) if (!team.some((m) => m.role === r)) throw new Error(`The team needs a ${ROLE_TEXT[r]}.`)
  p.team = team.map((m) => ({ name: m.name.trim(), role: m.role })); if (!p.team[p.as]) p.as = 0
  log(p, 'Team changed')
}

export function log(p: LabProject, what: string, build = false) { p.history.push({ utc: now(), what, by: me(p).name, ...(build ? { build } : {}) }); p.updatedUtc = now() }
// Any change to the build after UAT sign-off reopens UAT.
export function touched(p: LabProject, what: string) {
  needRole(p, 'builder', 'Changing the build')
  log(p, what, true)
  if (p.uat.signed && p.uat.buildHash !== buildHash(p.build)) { p.uat.signed = undefined; log(p, 'UAT sign-off withdrawn: the build changed after sign-off') }
}

// ---------- editing the schedule ----------
export function visitsFromProtocol(p: LabProject) {
  for (const sv of protocolOf(p).visits) {
    if (p.build.visits.some((v) => v.id === sv.id)) continue
    const day = sv.id === 'SCR' ? -14 : Math.round((sv.lo + sv.hi) / 2)
    p.build.visits.push({ id: sv.id, name: sv.name, day, lo: sv.lo, hi: sv.hi, forms: [] })
  }
  if (!p.build.visits.some((v) => v.id === 'UNS')) p.build.visits.push({ id: 'UNS', name: 'Unscheduled', day: 0, lo: -9999, hi: 9999, forms: [] })
  touched(p, 'Visits created from the schedule of activities')
}
export function setVisit(p: LabProject, id: string, patch: Partial<Visit>) {
  const v = p.build.visits.find((x) => x.id === id); if (!v) throw new Error(`No visit ${id}`)
  Object.assign(v, patch); if ('day' in patch) sortVisits(p.build); touched(p, `Visit ${id} changed`)
}
export function addVisit(p: LabProject, v: Visit) {
  if (!/^[A-Z][A-Z0-9]{0,7}$/.test(v.id)) throw new Error('A visit ID is 1 to 8 capital letters or digits, starting with a letter.')
  if (p.build.visits.some((x) => x.id === v.id)) throw new Error(`Visit ${v.id} already exists.`)
  p.build.visits.push(v); sortVisits(p.build); touched(p, `Visit ${v.id} added`)
}
// Scheduled visits in study-day order, unscheduled last: the order decides "the previous visit".
export function sortVisits(b: StudyBuild) {
  b.visits.sort((a, c) => (a.id === 'UNS' ? 1 : 0) - (c.id === 'UNS' ? 1 : 0) || a.day - c.day)
}
export function removeVisit(p: LabProject, id: string) { p.build.visits = p.build.visits.filter((v) => v.id !== id); touched(p, `Visit ${id} removed`) }
export function toggleFormAtVisit(p: LabProject, visit: string, form: string) {
  const v = p.build.visits.find((x) => x.id === visit); if (!v) throw new Error(`No visit ${visit}`)
  if (p.logForms.includes(form)) throw new Error(`${form} is a log form: it is collected at any time, not at a visit.`)
  const i = v.forms.indexOf(form)
  if (i >= 0) v.forms.splice(i, 1); else v.forms.push(form)
  touched(p, `${form} ${i >= 0 ? 'removed from' : 'added to'} ${visit}`)
}

// ---------- editing forms ----------
export function addLibraryForm(p: LabProject, id: string) {
  const f = LIBRARY[id]; if (!f) throw new Error(`No library form ${id}`)
  if (p.build.forms[id]) throw new Error(`Form ${id} is already in the build.`)
  p.build.forms[id] = clone(f)
  for (const fld of f.fields) if (fld.codelist && !p.build.codelists[fld.codelist] && LIBRARY_CODELISTS[fld.codelist]) p.build.codelists[fld.codelist] = clone(LIBRARY_CODELISTS[fld.codelist])
  if (CCG_FORM[id] && !p.build.ccg.forms[id]) p.build.ccg.forms[id] = [...CCG_FORM[id]]
  if (f.repeating && ['AE', 'CM', 'DV'].includes(id) && !p.logForms.includes(id)) p.logForms.push(id)
  touched(p, `Form ${id} added from the library`)
}
export function addBlankForm(p: LabProject, id: string, name: string, domain: string) {
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(id)) throw new Error('A form ID is 2 to 8 capital letters or digits, starting with a letter.')
  if (p.build.forms[id]) throw new Error(`Form ${id} already exists.`)
  p.build.forms[id] = { id, name, domain: domain.toUpperCase(), fields: [] }
  touched(p, `Form ${id} created`)
}
export function removeForm(p: LabProject, id: string) {
  delete p.build.forms[id]
  for (const v of p.build.visits) v.forms = v.forms.filter((f) => f !== id)
  p.logForms = p.logForms.filter((f) => f !== id)
  p.build.checks = p.build.checks.filter((c) => c.form !== id)
  delete p.build.ccg.forms[id]
  touched(p, `Form ${id} removed (with its checks)`)
}
export function setForm(p: LabProject, id: string, patch: Partial<Omit<FormDef, 'fields' | 'id'>>) { Object.assign(p.build.forms[id], patch); touched(p, `Form ${id} changed`) }
export function setLogForm(p: LabProject, id: string, log: boolean) {
  p.logForms = log ? [...new Set([...p.logForms, id])] : p.logForms.filter((f) => f !== id)
  if (log) for (const v of p.build.visits) v.forms = v.forms.filter((f) => f !== id)
  touched(p, `${id} ${log ? 'is now a log form' : 'is no longer a log form'}`)
}
export function addField(p: LabProject, form: string, f: Field) {
  const fd = p.build.forms[form]; if (!fd) throw new Error(`No form ${form}`)
  if (fd.fields.some((x) => x.id === f.id)) throw new Error(`${form}.${f.id} already exists.`)
  fd.fields.push(f); touched(p, `Field ${form}.${f.id} added`)
}
export function setField(p: LabProject, form: string, id: string, patch: Partial<Field>) {
  const f = p.build.forms[form]?.fields.find((x) => x.id === id); if (!f) throw new Error(`No field ${form}.${id}`)
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === '' || v === null) delete (f as unknown as Record<string, unknown>)[k]; else (f as unknown as Record<string, unknown>)[k] = v }
  touched(p, `Field ${form}.${id} changed`)
}
export function moveField(p: LabProject, form: string, id: string, by: -1 | 1) {
  const fs = p.build.forms[form].fields; const i = fs.findIndex((x) => x.id === id); const j = i + by
  if (i < 0 || j < 0 || j >= fs.length) return
  ;[fs[i], fs[j]] = [fs[j], fs[i]]; touched(p, `Field ${form}.${id} moved`)
}
export function removeField(p: LabProject, form: string, id: string) {
  const fd = p.build.forms[form]; fd.fields = fd.fields.filter((x) => x.id !== id)
  touched(p, `Field ${form}.${id} removed`)
}

// ---------- codelists ----------
export function addCodelist(p: LabProject, id: string) {
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(id)) throw new Error('A codelist ID is 2 to 10 capital letters or digits.')
  if (p.build.codelists[id]) throw new Error(`Codelist ${id} exists.`)
  p.build.codelists[id] = LIBRARY_CODELISTS[id] ? clone(LIBRARY_CODELISTS[id]) : []
  touched(p, `Codelist ${id} added`)
}
export function setCodelist(p: LabProject, id: string, values: Codelist[]) { p.build.codelists[id] = values; touched(p, `Codelist ${id} changed`) }
export function removeCodelist(p: LabProject, id: string) { delete p.build.codelists[id]; touched(p, `Codelist ${id} removed`) }

// ---------- edit checks ----------
export const T = (name: string, values: Record<string, string>, fire: boolean, ctx?: Record<string, string>): CheckTest => ({ name, values, fire, ...(ctx ? { ctx } : {}) })
export function addCheck(p: LabProject, c: Check) {
  if (p.build.checks.some((x) => x.id === c.id)) throw new Error(`Check ${c.id} exists.`)
  p.build.checks.push(c); touched(p, `Check ${c.id} added`)
}
export function setCheck(p: LabProject, id: string, patch: Partial<Check>) {
  const c = p.build.checks.find((x) => x.id === id); if (!c) throw new Error(`No check ${id}`)
  Object.assign(c, patch); touched(p, `Check ${id} changed`)
}
export function removeCheck(p: LabProject, id: string) { p.build.checks = p.build.checks.filter((c) => c.id !== id); touched(p, `Check ${id} removed`) }
export function nextCheckId(p: LabProject, form: string) {
  const n = p.build.checks.filter((c) => c.id.startsWith(`${form}-`)).map((c) => Number(c.id.split('-')[1]) || 0)
  return `${form}-${String(Math.max(0, ...n) + 1).padStart(2, '0')}`
}
// A required-field check with its two standard test cases.
export function missingCheck(p: LabProject, form: string, field: string): Check {
  const f = p.build.forms[form].fields.find((x) => x.id === field)!
  const cond = f.showIf && f.showIf.field !== '__visit' ? `${f.showIf.field} = '${f.showIf.equals}' and ` : ''
  const whenVals = f.showIf && f.showIf.field !== '__visit' ? { [f.showIf.field]: f.showIf.equals } : {}
  const sample = f.type === 'date' ? '2026-04-01' : f.type === 'number' ? '1' : f.type === 'yn' ? 'Y' : f.codelist ? (p.build.codelists[f.codelist]?.[0]?.value ?? 'X') : 'Entered'
  return {
    id: nextCheckId(p, form), title: `${f.label} is missing${cond ? ' (conditional)' : ''}`, category: 'missing', action: 'query', form, field,
    expr: `${cond}isblank(${field})`, message: `${f.label} is blank. Please enter the value from the source document, or record why it is not available.`,
    tests: [T('Blank fires', { ...whenVals, [field]: '' }, true), T('Entered value passes', { ...whenVals, [field]: sample }, false)], active: true,
    ...(f.showIf?.field === '__visit' ? { visits: [f.showIf.equals] } : {}),
  }
}
export function checkErrors(b: StudyBuild, c: Check): string {
  const form = b.forms[c.form]
  if (!form) return `Form ${c.form} is not in the build.`
  if (!form.fields.some((f) => f.id === c.field)) return `Field ${c.form}.${c.field} is not on the form.`
  return validate(c.expr, form.fields.map((f) => f.id), CTX_FNS)
}
export const CONTEXT_HELP: Record<string, string> = {
  consent: 'consent(): date informed consent was signed', rand: 'rand(): randomisation date (the Day 1 visit date)', visdat: "visdat('SCR'): date of a visit",
  val: "val('SCR', 'VS', 'HEIGHT'): a value on another form", vis: 'vis(): this visit ID', today: 'today(): the current date', winlo: 'winlo(): first study day of this visit window',
  winhi: 'winhi(): last study day of this visit window', prevvisdat: 'prevvisdat(): date of the previous visit', lastvisdat: 'lastvisdat(): latest visit date',
  prevdisp: "prevdisp('EXDSPQ'): a value at the previous dispensing visit", prevdispdat: 'prevdispdat(): date of the previous dispensing visit', eos: 'eos(): end of study status', eosdat: 'eosdat(): end of study date',
  aecount: "aecount('AESER', 'Y'): number of AEs with a value", aematch: "aematch('FALL'): number of AEs whose term contains a word",
}

// ---------- UAT ----------
export function runUat(p: LabProject, by = me(p).name): UatStep[] {
  needRole(p, 'tester', 'Running UAT')
  const utc = now()
  p.uat.runBy = by
  const steps = p.build.checks.filter((c) => c.active).flatMap((c) => (checkErrors(p.build, c) ? [{ checkId: c.id, test: '(does not parse)', expected: true, actual: 'error' as const, utc, by }]
    : c.tests.map((t) => ({ checkId: c.id, test: t.name, expected: t.fire, actual: runTest(c, t), utc, by }))))
  p.uat.runs = steps
  p.uat.runHash = buildHash(p.build)
  for (const s of steps.filter((x) => x.actual !== x.expected)) {
    if (!p.uat.issues.some((i) => i.checkId === s.checkId && i.status === 'open')) p.uat.issues.push({ id: uid('U-'), checkId: s.checkId, text: `${s.checkId} "${s.test}": expected ${s.expected ? 'to fire' : 'not to fire'}, ${s.actual === 'error' ? 'the check could not run' : s.actual ? 'it fired' : 'it did not fire'}.`, status: 'open', utc })
  }
  // An issue is fixed when its check now passes all its tests.
  for (const i of p.uat.issues.filter((x) => x.status === 'open' && !x.checkId.includes('.'))) {
    if (!steps.some((s) => s.checkId === i.checkId && s.actual !== s.expected)) { i.status = 'fixed'; i.resolution = 'Retested: all test cases pass.' }
  }
  log(p, `UAT run: ${steps.length} test cases, ${steps.filter((s) => s.actual !== s.expected).length} failed`)
  return steps
}
export function uatState(p: LabProject) {
  const runs = p.uat.runs
  const failed = runs.filter((s) => s.actual !== s.expected)
  const tested = new Set(runs.map((r) => r.checkId))
  const untested = p.build.checks.filter((c) => c.active && !tested.has(c.id)).map((c) => c.id)
  const fewTests = p.build.checks.filter((c) => c.active && (c.tests.length < 2 || !c.tests.some((t) => t.fire) || !c.tests.some((t) => !t.fire))).map((c) => c.id)
  const out = new Set((p.uat.outOfScope ?? []).map((o) => o.scriptId))
  const open = p.uat.issues.filter((i) => i.status === 'open' && !out.has(i.checkId.split('.')[0]))
  const stale = !!runs.length && !!p.uat.runHash && p.uat.runHash !== buildHash(p.build)
  const sc = scriptState(p)
  return { runs: runs.length, failed: failed.length, untested, fewTests, open: open.length, stale, scripts: sc,
    ready: runs.length > 0 && !stale && !failed.length && !untested.length && !open.length && !fewTests.length && sc.done }
}
export function acceptIssue(p: LabProject, id: string, why: string) {
  needRole(p, 'tester', 'Accepting a UAT issue')
  if (!why.trim()) throw new Error('Give the reason the issue can be accepted without a fix.')
  const it = p.uat.issues.find((y) => y.id === id); if (!it || it.status !== 'open') throw new Error('That issue is not open.')
  it.status = 'accepted'; it.resolution = `Accepted by ${me(p).name}: ${why.trim()}`; log(p, `UAT issue on ${it.checkId} accepted`)
}
export function signUat(p: LabProject, s: Omit<Signature, 'utc'>) {
  needRole(p, 'tester', 'Signing UAT')
  if (s.name.trim().toLowerCase() !== me(p).name.toLowerCase()) throw new Error(`Sign with your own name (${me(p).name}).`)
  if (buildersOf(p).some((b) => b.toLowerCase() === s.name.trim().toLowerCase())) throw new Error(`${s.name} changed this build, so cannot approve its testing. UAT is signed by someone independent of the build.`)
  const st = uatState(p)
  if (!st.ready) throw new Error('UAT is not complete: run every test, execute every test script, fix or accept every issue, and give every check a firing and a passing test case.')
  if (!p.uat.summary?.trim()) throw new Error('Write the UAT summary first.')
  const partial = (p.uat.outOfScope ?? []).map((o) => o.scriptId).sort()
  if (partial.length && !partial.every((id) => p.uat.summary!.includes(id))) throw new Error(`This is a partial UAT: name each script left out of scope (${partial.join(', ')}) and why in the summary.`)
  p.uat.signed = { ...s, ...(partial.length ? { partial, meaning: `${s.meaning} Partial UAT: ${partial.join(', ')} out of scope for this round.` } : {}), utc: now() }; p.uat.buildHash = buildHash(p.build)
  log(p, `${partial.length ? 'Partial ' : ''}UAT signed by ${s.name} (${s.role})`)
}

// ---------- release ----------
export function buildHash(b: StudyBuild): string {
  const s = JSON.stringify({ ...b, study: { ...b.study, buildVersion: '', source: '' } })
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
export function exportBuild(p: LabProject): StudyBuild {
  const b = clone(p.build)
  b.study.source = 'EDC Study Build Lab'
  return b
}
export function release(p: LabProject, version: string, notes: string, s: Omit<Signature, 'utc'>) {
  needRole(p, 'lead', 'Releasing a build')
  if (s.name.trim().toLowerCase() !== me(p).name.toLowerCase()) throw new Error(`Sign with your own name (${me(p).name}).`)
  if (!p.uat.signed || p.uat.buildHash !== buildHash(p.build)) throw new Error('Release needs a UAT sign-off on this exact build.')
  if (p.uat.signed.partial?.length) throw new Error(`The UAT sign-off is partial (${p.uat.signed.partial.join(', ')} out of scope). A production release needs every script in scope and passed.`)
  if (!/^\d+\.\d+$/.test(version)) throw new Error('A build version looks like 1.0 or 1.1.')
  if (p.releases.some((r) => r.version === version)) throw new Error(`Version ${version} was already released.`)
  const last = p.releases.at(-1)
  if (last && Number(version) <= Number(last.version)) throw new Error(`Version ${version} must be later than ${last.version}.`)
  p.build.study.buildVersion = version
  p.uat.buildHash = buildHash(p.build)
  const r: Release = { version, utc: now(), hash: buildHash(p.build), signed: { ...s, utc: now() }, notes }
  p.releases.push(r); log(p, `Build ${version} released by ${s.name}`)
  return r
}

export function importBuild(p: LabProject, text: string): string[] {
  needRole(p, 'builder', 'Importing a build')
  let b: StudyBuild
  try { b = JSON.parse(text) } catch { throw new Error('The file is not valid JSON.') }
  if (b?.format !== BUILD_FORMAT || b.version !== 1) throw new Error(`This is not a ${BUILD_FORMAT} version 1 file.`)
  if (b.study?.protocol !== PROTOCOL_ID) throw new Error(`The build is for ${b.study?.protocol}; this lab builds ${PROTOCOL_ID}.`)
  p.build = b
  p.logForms = Object.values(b.forms).filter((f) => f.repeating && !b.visits.some((v) => v.forms.includes(f.id))).map((f) => f.id)
  touched(p, `Build ${b.study.buildVersion} imported from ${b.study.source}`)
  return [`Imported ${Object.keys(b.forms).length} forms, ${b.visits.length} visits and ${b.checks.length} checks.`]
}
