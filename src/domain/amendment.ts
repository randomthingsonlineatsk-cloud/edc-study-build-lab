// Mission M4: a protocol amendment after go-live. Build 1.0 is in production and sites have
// entered data. Amendment 3 changes the protocol. The team assesses the impact, builds 1.1,
// re-tests what the change touches (regression scoped by impact), releases it and checks what
// the new build does to data already entered.
import { createProject, referenceBuild, buildHash, runUat, type LabProject, type CasebookEntry, type StudyBuild } from './lab'
import { AMENDMENT_3, AMENDMENT_EFFECTIVE } from './m11'
import { SCRIPTS, executeStep, pageQueries } from './scripts'
import { rng, addDays } from './util'

// ---------- the impact assessment ----------
export interface ImpactQ { id: string; q: string; options: { id: string; text: string }[]; answer: string; why: string }
export const IMPACT_QS: ImpactQ[] = [
  { id: 'I1', q: 'Which changes does amendment 3 need in the build?', answer: 'c',
    options: [{ id: 'a', text: 'A new Week 6 visit only; magnesium goes on the central laboratory sample.' }, { id: 'b', text: 'A new laboratory form for magnesium, and a new check replacing every potassium check.' }, { id: 'c', text: 'A Week 6 visit with SV and LB, a magnesium field on LB at SCR, W4, W6 and W12, and a changed potassium check.' }],
    why: 'Amendment sections 1.3 and 8.4.4: magnesium is part of the local safety laboratory, and only the safety follow-up threshold changes.' },
  { id: 'I2', q: 'What must be tested again (regression)?', answer: 'b',
    options: [{ id: 'a', text: 'Everything: a new build version needs full UAT.' }, { id: 'b', text: 'What the change touches: the LB form and its checks, the visit schedule and the visit-window and visit-order checks, plus the new checks. Unchanged forms keep their 1.0 results.' }, { id: 'c', text: 'Only the new magnesium check.' }],
    why: 'Re-testing is scoped by the impact assessment; the lab keeps a script result valid while the forms, checks and visits it tested are unchanged.' },
  { id: 'I3', q: 'How should the 5.0 mmol/L potassium rule treat results entered before the effective date?', answer: 'b',
    options: [{ id: 'a', text: 'Apply it to all results, so sites get queries on earlier values between 5.0 and 5.5 mmol/L.' }, { id: 'b', text: `Apply it to results dated on or after ${AMENDMENT_EFFECTIVE}; earlier results keep the 5.5 rule, and values of 5.0 to 5.5 go to the medical monitor in a listing.` }, { id: 'c', text: 'Leave the 5.5 check as it is and review new results by hand.' }],
    why: 'Amendment section 8.4.4 says so. Queries on data that were correct under the protocol at the time would be wrong and would burden sites.' },
  { id: 'I4', q: 'What about magnesium on laboratory pages before the effective date?', answer: 'c',
    options: [{ id: 'a', text: 'Sites must add it to every earlier page.' }, { id: 'b', text: 'Make magnesium optional everywhere, so no query ever fires.' }, { id: 'c', text: 'Required only for results dated on or after the effective date: the missing-value check is conditional on the date, and earlier pages stay blank without queries.' }],
    why: 'The amendment says results before the effective date are not collected retrospectively.' },
  { id: 'I5', q: 'Participants already past Week 6 when the amendment takes effect:', answer: 'a',
    options: [{ id: 'a', text: 'Week 6 is not expected for them: it is not a missed visit or a deviation. Document the rule in the data management plan and the completion guidelines.' }, { id: 'b', text: 'Record Week 6 as not done, with a protocol deviation.' }, { id: 'c', text: 'Ask sites to book a catch-up Week 6 visit.' }],
    why: 'A visit added by amendment applies from the effective date; reporting it as missed would create false deviations.' },
]
export function impactScore(p: LabProject) {
  const a = p.impact ?? {}
  const right = IMPACT_QS.filter((q) => a[q.id] === q.answer).length
  return { right, total: IMPACT_QS.length, answered: IMPACT_QS.filter((q) => a[q.id]).length }
}

// ---------- the production data entered under build 1.0 ----------
export interface ProdPage { subj: string; visit: string; date: string; entries: CasebookEntry[] }
// 30 randomised participants; laboratory pages at Screening and Week 4 (and Week 12 where it falls
// before the effective date). A few potassium results sit between 5.0 and 5.5 mmol/L.
export function productionData(): ProdPage[] {
  const r = rng(2043), out: ProdPage[] = []
  for (let i = 0; i < 30; i++) {
    const subj = `${['101', '102', '201', '202', '301', '302'][i % 6]}-${String(1 + Math.floor(i / 6)).padStart(3, '0')}`
    const rand = addDays('2026-03-02', i * 6 + r.int(0, 3))
    const cons = addDays(rand, -20), scr = addDays(rand, -18)
    const base: CasebookEntry[] = [{ visit: 'SCR', form: 'IC', inst: 1, values: { DSSTDAT: cons, ICVER: 'v2.0' } }, { visit: 'SCR', form: 'SV', inst: 1, values: { VISOCCUR: 'Y', VISDAT: scr } }, { visit: 'D1', form: 'SV', inst: 1, values: { VISOCCUR: 'Y', VISDAT: rand } }]
    const lab = (visit: string, date: string, k: number): ProdPage => ({ subj, visit, date, entries: [...base, ...(visit !== 'SCR' ? [{ visit, form: 'SV', inst: 1, values: { VISOCCUR: 'Y', VISDAT: date } }] : []), { visit, form: 'LB', inst: 1, values: { LBDAT: date, GLUC: (5 + r.next()).toFixed(1), GLUCU: 'mmol/L', K: k.toFixed(1), CREAT: String(r.int(65, 105)), ALT: String(r.int(12, 40)) } }] })
    const kv = () => Math.min(5.45, Math.max(3.6, r.normal(4.55, 0.32)))
    out.push(lab('SCR', scr, Math.min(kv(), 5.3)))
    const w4 = addDays(rand, 27); if (w4 < AMENDMENT_EFFECTIVE) out.push(lab('W4', w4, [3, 11, 17].includes(i) ? 5.1 + (i % 4) / 10 : kv()))
    const w12 = addDays(rand, 84); if (w12 < AMENDMENT_EFFECTIVE) out.push(lab('W12', w12, [6, 22].includes(i) ? 5.3 : kv()))
  }
  return out
}
const PROD = productionData()
const RANDS = (() => { const m = new Map<string, string>(); for (const pg of PROD) m.set(pg.subj, pg.entries.find((e) => e.visit === 'D1')!.values.VISDAT); return m })()

// What the build would do to the data already entered: the queries it raises on those pages that
// build 1.0 did not, by check.
export function historicImpact(p: LabProject, baseline: StudyBuild = referenceBuild()) {
  const key = (q: { checkId: string; field: string }) => `${q.checkId}|${q.field}`
  const newQ = new Map<string, number>(); let pages = 0
  for (const pg of PROD) {
    const before = new Set(pageQueries(baseline, pg.entries, pg.visit, 'LB').map(key))
    const now = pageQueries(p.build, pg.entries, pg.visit, 'LB').filter((q) => !before.has(key(q)))
    if (now.length) pages++
    for (const q of now) newQ.set(q.checkId, (newQ.get(q.checkId) ?? 0) + 1)
  }
  const listing = PROD.filter((pg) => { const k = Number(pg.entries.find((e) => e.form === 'LB')!.values.K); return k >= 5.0 && k <= 5.5 }).map((pg) => ({ subj: pg.subj, visit: pg.visit, date: pg.date, k: pg.entries.find((e) => e.form === 'LB')!.values.K }))
  const pastW6 = [...RANDS.entries()].filter(([, r]) => addDays(r, 43) < AMENDMENT_EFFECTIVE).length
  return { pages: PROD.length, pagesWithNew: pages, newQueries: [...newQ.entries()].map(([checkId, n]) => ({ checkId, n })), listing, participants: RANDS.size, pastW6 }
}

// ---------- the mission project ----------
// Build 1.0 released on 2026-06-01 after full UAT; amendment 3 then arrives.
export function createAmendProject(name = 'VASCLEAR-2 build 1.0 in production (amendment 3)'): LabProject {
  const p = createProject('draft', { name })
  p.start = 'amend'
  p.build = referenceBuild(); p.build.study.source = 'EDC Study Build Lab'; p.build.study.buildVersion = '1.0'
  p.history = [{ utc: '2026-05-10T09:00:00.000Z', what: 'Build 0.1 to 1.0 changes made', by: p.team[0].name, build: true }]
  // The 1.0 UAT, executed by the tester.
  p.as = p.team.findIndex((m) => m.role === 'tester')
  runUat(p)
  for (const s of SCRIPTS.filter((x) => !x.amendment)) for (const st of s.steps) executeStep(p, s.id, st.id, st.values)
  p.uat.summary = 'Build 1.0 UAT: all check test cases and scripts S1 to S6 passed.'
  const t = p.team[p.as]
  p.uat.signed = { name: t.name, role: 'UAT tester', meaning: 'I approve the UAT results: the edit checks of this build work as specified.', utc: '2026-05-28T15:00:00.000Z' }
  p.uat.buildHash = buildHash(p.build)
  const lead = p.team.find((m) => m.role === 'lead')!
  p.releases = [{ version: '1.0', utc: '2026-06-01T08:00:00.000Z', hash: buildHash(p.build), signed: { name: lead.name, role: 'Lead data manager', meaning: 'I release this build for production use.', utc: '2026-06-01T08:00:00.000Z' }, notes: 'First production release.' }]
  for (const r of p.uat.scripts ?? []) r.utc = '2026-05-27T12:00:00.000Z'
  p.history.push({ utc: '2026-06-01T08:00:00.000Z', what: 'Build 1.0 released', by: lead.name }, { utc: new Date().toISOString(), what: `Amendment 3 received (protocol ${AMENDMENT_3.version}, effective ${AMENDMENT_EFFECTIVE})`, by: lead.name })
  p.protocol = 'A3'
  p.as = 0
  return p
}
