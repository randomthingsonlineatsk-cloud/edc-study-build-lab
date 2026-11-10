import { describe, expect, test } from 'vitest'
import { createProject, referenceBuild, runUat, uatState, signUat, release, exportBuild, importBuild, buildHash, setCheck, setVisit, addVisit, addField, addLibraryForm, removeForm, setLogForm, toggleFormAtVisit, visitsFromProtocol, me, upgrade, type LabProject, type Role } from '../src/domain/lab'
import { review } from '../src/domain/review'
import { annotatedCrf, dvsCsv, ccgHtml, uatReport } from '../src/domain/docs'
import { startMission, grade, submitMission, bugFixed, certificate, potassiumRuleOk, magnesiumRuleOk } from '../src/domain/missions'
import { SCRIPTS, scriptsFor, executeStep, scriptState, stepState, setOutOfScope, bringIntoScope } from '../src/domain/scripts'
import { createAmendProject, historicImpact, IMPACT_QS } from '../src/domain/amendment'
import { usdmOf, generateBuild, createFromUsdm } from '../src/domain/usdm'
import { odmXml } from '../src/domain/odm'
import { protocolOf } from '../src/domain/m11'

const as = (p: LabProject, role: Role) => { p.as = p.team.findIndex((m) => m.role === role); return me(p) }
const sig = (p: LabProject) => ({ name: me(p).name, role: me(p).role, meaning: 'Approved' })
const runScripts = (p: LabProject) => { as(p, 'tester'); for (const s of scriptsFor(p)) for (const st of s.steps) if (stepState(p, s, st.id).state !== 'pass') executeStep(p, s.id, st.id, st.values) }
const finish = (p: LabProject, version = '1.0') => {
  as(p, 'tester'); runUat(p); runScripts(p); p.uat.summary = 'All checks and scripts tested.'; signUat(p, sig(p))
  as(p, 'lead'); release(p, version, 'Release', sig(p))
}
const withRef = (p: LabProject) => { as(p, 'builder'); importBuild(p, JSON.stringify(referenceBuild())); return p }

describe('draft build', () => {
  test('has the protocol gaps and the three faulty checks', () => {
    const p = createProject('draft'); as(p, 'tester'); runUat(p)
    const r = review(p)
    expect(r.high).toBe(4)
    expect(r.all.map((f) => f.id)).toEqual(expect.arrayContaining(['P-window-W8', 'P-miss-EG-W4', 'P-form-PREG', 'P-crit-EX04', 'K-N-EX04']))
    expect(p.uat.issues.map((i) => i.checkId).sort()).toEqual(['AE-11', 'LB-07', 'VS-09'])
    expect(uatState(p).ready).toBe(false)
  })
  test('the reference build is clean and passes all test cases and scripts', () => {
    const p = withRef(createProject('draft')); as(p, 'tester'); runUat(p); runScripts(p)
    const r = review(p)
    expect(r.high + r.medium).toBe(0)
    expect(scriptState(p).done).toBe(true)
    expect(uatState(p).ready).toBe(true)
  })
})

describe('roles', () => {
  test('only the builder changes the build, only the tester runs and signs UAT, only the lead releases', () => {
    const p = withRef(createProject('draft'))
    as(p, 'tester'); expect(() => setVisit(p, 'W8', { hi: 63 })).toThrow(/builder/)
    as(p, 'builder'); expect(() => runUat(p)).toThrow(/tester/)
    as(p, 'tester'); runUat(p); runScripts(p); p.uat.summary = 'Done.'
    expect(() => signUat(p, { ...sig(p), name: 'Someone Else' })).toThrow(/own name/)
    signUat(p, sig(p))
    expect(() => release(p, '1.0', 'x', sig(p))).toThrow(/lead/)
  })
  test('a builder cannot approve UAT of a build they changed', () => {
    const p = withRef(createProject('draft'))
    const builder = as(p, 'builder').name
    p.team[1].name = builder // the tester now carries the builder's name
    as(p, 'tester'); runUat(p); runScripts(p); p.uat.summary = 'Done.'
    expect(() => signUat(p, sig(p))).toThrow(/independent/)
  })
  test('older saved projects get a team', () => {
    const p = createProject('draft') as Partial<LabProject>; delete p.team
    expect(upgrade(p as LabProject).team.length).toBe(3)
  })
})

describe('UAT and release', () => {
  test('release needs a signed UAT on this exact build, and changes withdraw the sign-off', () => {
    const p = withRef(createProject('draft')); as(p, 'tester'); runUat(p); runScripts(p)
    expect(() => signUat(p, sig(p))).toThrow(/summary/)
    p.uat.summary = 'Done.'; signUat(p, sig(p))
    as(p, 'builder'); setVisit(p, 'W8', { hi: 63 })
    expect(p.uat.signed).toBeUndefined()
    setVisit(p, 'W8', { hi: 64 })
    as(p, 'lead'); expect(() => release(p, '1.0', 'x', sig(p))).toThrow(/UAT/)
    as(p, 'tester'); runUat(p); signUat(p, sig(p))
    as(p, 'lead'); expect(() => release(p, 'v1', 'x', sig(p))).toThrow(/1.0/)
    release(p, '1.0', 'First', sig(p))
    expect(p.releases[0].hash).toBe(buildHash(p.build))
    expect(() => release(p, '1.0', 'again', sig(p))).toThrow(/already/)
  })
  test('an exported build imports back unchanged', () => {
    const p = withRef(createProject('draft')); finish(p)
    const q = createProject('blank'); importBuild(q, JSON.stringify(exportBuild(p)))
    expect(buildHash(q.build)).toBe(buildHash(p.build))
    expect(q.logForms.sort()).toEqual(p.logForms.sort())
    expect(() => importBuild(q, '{"format":"x"}')).toThrow()
  })
})

describe('scripted UAT', () => {
  test('on the draft, scripts find the faulty checks and block on missing forms', () => {
    const p = createProject('draft'); runScripts(p)
    const st = Object.fromEntries(scriptState(p).rows.map((r) => [r.id, r]))
    expect(st.S1.done).toBe(false) // W8 window 54 to 60 in the draft
    expect(stepState(p, SCRIPTS[1], '5').state).toBe('fail') // VS-09 strict ">"
    expect(stepState(p, SCRIPTS[2], '3').state).toBe('fail') // LB-07 limit 3.0
    expect(stepState(p, SCRIPTS[3], '3').state).toBe('fail') // AE-11 swapped dates
    expect(stepState(p, SCRIPTS[4], '3').state).toBe('blocked') // no PREG form
    expect(p.uat.issues.some((i) => i.checkId === 'S2.5' && i.status === 'open')).toBe(true)
  })
  test('entering other values than the script is a deviation, and a fixed failure closes its issue', () => {
    const p = createProject('draft'); as(p, 'tester')
    const s = SCRIPTS[1]
    for (const st of s.steps.slice(0, 4)) executeStep(p, s.id, st.id, st.values)
    expect(executeStep(p, s.id, '5', { ...s.steps[4].values, DIABP: '149' }).status).toBe('deviation')
    expect(executeStep(p, s.id, '5', s.steps[4].values).status).toBe('fail')
    as(p, 'builder'); setCheck(p, 'VS-09', { expr: 'DIABP >= SYSBP' })
    expect(stepState(p, s, '5').state).toBe('retest')
    as(p, 'tester'); expect(executeStep(p, s.id, '5', s.steps[4].values).status).toBe('pass')
    expect(p.uat.issues.find((i) => i.checkId === 'S2.5')!.status).toBe('fixed')
  })
})

describe('build from the protocol', () => {
  test('visits from the protocol, library forms and the schedule clear the protocol findings for them', () => {
    const p = createProject('library')
    visitsFromProtocol(p)
    expect(review(p).all.some((f) => f.id.startsWith('P-visit-'))).toBe(false)
    addLibraryForm(p, 'PREG')
    for (const v of ['SCR', 'D1', 'W12']) toggleFormAtVisit(p, v, 'PREG')
    expect(review(p).all.some((f) => f.id === 'P-form-PREG')).toBe(false)
  })
})

describe('documents and ODM', () => {
  test('annotated CRF, specification, guidelines and UAT report', () => {
    const p = withRef(createProject('draft')); finish(p)
    expect(annotatedCrf(p)).toContain('VS.VSORRES (VSTESTCD = SYSBP)')
    const csv = dvsCsv(p).split('\r\n')
    expect(csv.length).toBe(p.build.checks.length + 1)
    expect(ccgHtml(p)).toContain('<h2>')
    expect(uatReport(p)).toContain('Signed by')
  })
  test('the ODM v2.0 export has the study metadata', () => {
    const xml = odmXml(withRef(createProject('draft')), '2026-11-10T10:00:00')
    expect(xml).toContain('ODMVersion="2.0"'); expect(xml).toContain('<RangeCheck SoftHard="Soft">'); expect(xml).toContain('StudyEventDef OID="SE.W4"')
  })
})

describe('USDM digital protocol', () => {
  test('the generated first-pass build has the typical automation misses', () => {
    const u = usdmOf()
    expect(u.usdmVersion).toBe('4.0.0')
    expect(u.study.versions[0].studyDesigns[0].encounters.length).toBe(7)
    const g = generateBuild(u)
    const scr = g.build.visits.find((v) => v.id === 'SCR')!
    expect([scr.lo, scr.hi]).not.toEqual([-28, -1])
    expect(g.build.forms.F11).toBeDefined()
    expect(g.build.forms.PREG).toBeUndefined()
    expect(g.build.visits.find((v) => v.id === 'W4')!.forms).toContain('AE')
    expect(g.build.visits.some((v) => v.id === 'UNS')).toBe(false)
    expect(g.notes.length).toBeGreaterThan(4)
    expect(() => generateBuild({ ...u, study: { ...u.study, versions: [{ ...u.study.versions[0], studyIdentifiers: [{ ...u.study.versions[0].studyIdentifiers[0], text: 'X-1' }] }] } })).toThrow(/X-1/)
  })
  test('fixing the generated build by hand clears its findings', () => {
    const p = createFromUsdm()
    expect(review(p).high).toBeGreaterThan(5)
    as(p, 'builder')
    setVisit(p, 'SCR', { lo: -28, hi: -1, day: -14 })
    removeForm(p, 'F11'); addLibraryForm(p, 'PREG'); for (const v of ['SCR', 'D1', 'W12']) toggleFormAtVisit(p, v, 'PREG')
    setLogForm(p, 'AE', true); setLogForm(p, 'CM', true)
    const ids = review(p).all.map((f) => f.id)
    expect(ids).not.toContain('P-window-SCR'); expect(ids).not.toContain('P-form-PREG'); expect(ids).not.toContain('P-log-AE')
  })
})

describe('amendment 3', () => {
  test('protocol 4.0 adds W6 and magnesium; the 1.0 build no longer matches it', () => {
    const p = createAmendProject()
    expect(protocolOf(p).visits.map((v) => v.id)).toContain('W6')
    const ids = review(p).all.map((f) => f.id)
    expect(ids).toEqual(expect.arrayContaining(['P-visit-W6', 'K-N-k']))
    expect(p.releases[0].version).toBe('1.0')
    // the 1.0 scripts carry their results; S7 is new
    expect(scriptState(p).rows.find((r) => r.id === 'S2')!.done).toBe(true)
    expect(scriptState(p).rows.find((r) => r.id === 'S7')!.done).toBe(false)
  })
  test('a correct amendment build scores 100, re-testing only what changed', () => {
    const p = startMission('M4', 'standard')
    p.impact = Object.fromEntries(IMPACT_QS.map((q) => [q.id, q.answer]))
    as(p, 'builder')
    addVisit(p, { id: 'W6', name: 'Week 6 (safety)', day: 42, lo: 40, hi: 44, forms: ['SV', 'LB'] })
    addField(p, 'LB', { id: 'MG', label: 'Magnesium', type: 'number', unit: 'mmol/L', required: true })
    const sv4 = p.build.checks.find((c) => c.id === 'SV-04')!, sv7 = p.build.checks.find((c) => c.id === 'SV-07')!
    setCheck(p, 'SV-04', { visits: [...sv4.visits!, 'W6'] }); setCheck(p, 'SV-07', { visits: [...sv7.visits!, 'W6'] })
    setCheck(p, 'LB-13', { expr: "vis() != 'SCR' and aematch('kal') = 0 and (K > 5.5 or (K >= 5.0 and present(LBDAT) and days('2026-09-15', LBDAT) >= 0))" })
    p.build.checks.push({ id: 'LB-14', title: 'Magnesium missing (from 2026-09-15)', category: 'missing', action: 'query', form: 'LB', field: 'MG', expr: "isblank(MG) and present(LBDAT) and days('2026-09-15', LBDAT) >= 0", message: 'Magnesium is blank. Please enter it from the source.', tests: [{ name: 'Blank after fires', values: { MG: '', LBDAT: '2026-09-20' }, fire: true }, { name: 'Blank before passes', values: { MG: '', LBDAT: '2026-08-20' }, fire: false }], active: true })
    expect(potassiumRuleOk(p)).toBe(true); expect(magnesiumRuleOk(p)).toBe(true)
    expect(historicImpact(p).newQueries).toEqual([])
    const before = scriptState(p).rows
    expect(before.find((r) => r.id === 'S4')!.done).toBe(true) // AE untouched: carried forward
    expect(before.find((r) => r.id === 'S3')!.done).toBe(false) // LB changed: re-test
    finish(p, '1.1')
    const g = grade(p)!
    expect(g.results.filter((r) => !r.ok).map((r) => r.id)).toEqual([])
    expect(g.score).toBe(100)
  })
  test('a potassium rule without the date limit queries old data', () => {
    const p = createAmendProject(); as(p, 'builder')
    setCheck(p, 'LB-13', { expr: "vis() != 'SCR' and K >= 5.0 and aematch('kal') = 0" })
    expect(potassiumRuleOk(p)).toBe(false)
    expect(historicImpact(p).newQueries.reduce((a, q) => a + q.n, 0)).toBeGreaterThan(0)
  })
})

describe('missions and certificate', () => {
  test('M1 scores 100 with the reference build, released', () => {
    const p = withRef(startMission('M1', 'guided')); finish(p)
    expect(grade(p)!.score).toBe(100)
    expect(submitMission(p).passed).toBe(true)
  })
  test('the draft scores low', () => { expect(grade(startMission('M1', 'standard'))!.score).toBeLessThan(20) })
  test('changing a test expectation does not fix a faulty check', () => {
    const p = startMission('M3', 'expert')
    const c = p.build.checks.find((x) => x.id === 'VS-09')!
    setCheck(p, 'VS-09', { tests: c.tests.map((t) => ({ ...t, fire: Number(t.values.DIABP) > Number(t.values.SYSBP) })) })
    expect(bugFixed(p, 'VS-09')).toBe(false)
    setCheck(p, 'VS-09', { expr: 'DIABP >= SYSBP' })
    expect(bugFixed(p, 'VS-09')).toBe(true)
  })
  test('M3 ends in a partial UAT that cannot be released', () => {
    const p = startMission('M3', 'standard')
    as(p, 'builder')
    setCheck(p, 'VS-09', { expr: 'DIABP >= SYSBP' })
    setCheck(p, 'LB-07', { expr: "GLUCU = 'mmol/L' and (GLUC < 2.0 or GLUC > 30)" })
    setCheck(p, 'AE-11', { expr: 'present(AESTDAT) and present(consent()) and days(consent(), AESTDAT) < 0' })
    setVisit(p, 'W8', { lo: 50, hi: 64 })
    as(p, 'tester'); runUat(p)
    for (const s of scriptsFor(p)) for (const st of s.steps) executeStep(p, s.id, st.id, st.values)
    expect(uatState(p).ready).toBe(false) // S5 and S6 blocked
    expect(() => setOutOfScope(p, 'S5', 'short')).toThrow(/why/)
    setOutOfScope(p, 'S5', 'The PREG form is not in this draft build yet.')
    setOutOfScope(p, 'S6', 'EX04 cannot be recorded in this draft build yet.')
    expect(uatState(p).ready).toBe(true)
    p.uat.summary = 'Targeted round: the three faulty checks fixed and re-tested.'
    expect(() => signUat(p, sig(p))).toThrow(/S5, S6/)
    p.uat.summary += ' S5 and S6 out of scope: their forms are not built yet.'
    signUat(p, sig(p))
    expect(p.uat.signed!.partial).toEqual(['S5', 'S6'])
    const g = grade(p)!
    expect(g.results.filter((r) => !r.ok).map((r) => r.id)).toEqual([])
    as(p, 'lead'); expect(() => release(p, '1.0', 'x', sig(p))).toThrow(/partial/)
    as(p, 'tester'); bringIntoScope(p, 'S5')
    expect(p.uat.signed).toBeUndefined()
  })
  test('M2 and M5 score 100 with the reference build, released', () => {
    for (const id of ['M2', 'M5']) { const p = withRef(startMission(id, 'standard')); finish(p); expect(grade(p)!.score).toBe(100) }
  })
  test('the certificate needs all five missions and has a stable code', () => {
    const ps = ['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => { const p = startMission(id, 'expert'); p.mission!.endedUtc = '2026-11-10T00:00:00Z'; p.mission!.score = 90; return p })
    const c = certificate(ps, 'u-1', 'Test Learner')
    expect(c.eligible).toBe(true); expect(c.distinction).toBe(true)
    expect(c.code).toMatch(/^EDC-[0-9A-F]{5}-[0-9A-F]{5}$/)
    expect(certificate(ps, 'u-1', ' test learner ').code).toBe(c.code)
    expect(certificate(ps.slice(1), 'u-1', 'Test Learner').eligible).toBe(false)
  })
})
