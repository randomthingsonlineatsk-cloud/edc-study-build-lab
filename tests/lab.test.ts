import { describe, expect, test } from 'vitest'
import { createProject, referenceBuild, runUat, uatState, signUat, release, exportBuild, importBuild, buildHash, setCheck, setVisit, addLibraryForm, toggleFormAtVisit, visitsFromProtocol } from '../src/domain/lab'
import { review } from '../src/domain/review'
import { annotatedCrf, dvsCsv, ccgHtml, uatReport } from '../src/domain/docs'
import { startMission, grade, submitMission, bugFixed } from '../src/domain/missions'

const S = { name: 'Test User', role: 'Lead data manager', meaning: 'Approved' }
const finish = (p: ReturnType<typeof createProject>) => { runUat(p, 't'); p.uat.summary = 'All checks tested.'; signUat(p, S); release(p, '1.0', 'First release', S) }

describe('draft build', () => {
  test('has the protocol gaps and the three faulty checks', () => {
    const p = createProject('draft'); runUat(p, 't')
    const r = review(p)
    expect(r.high).toBe(4)
    expect(r.all.map((f) => f.id)).toEqual(expect.arrayContaining(['P-window-W8', 'P-miss-EG-W4', 'P-form-PREG', 'P-crit-EX04', 'K-N-EX04']))
    expect(p.uat.issues.map((i) => i.checkId).sort()).toEqual(['AE-11', 'LB-07', 'VS-09'])
    expect(uatState(p).ready).toBe(false)
    expect(() => signUat(p, S)).toThrow()
  })
  test('the reference build is clean and passes UAT', () => {
    const p = createProject('draft'); p.build = referenceBuild(); runUat(p, 't')
    const r = review(p)
    expect(r.high + r.medium).toBe(0)
    expect(uatState(p).ready).toBe(true)
  })
})

describe('UAT and release', () => {
  test('release needs a signed UAT on this exact build, and changes withdraw the sign-off', () => {
    const p = createProject('draft'); p.build = referenceBuild(); runUat(p, 't')
    expect(() => release(p, '1.0', 'x', S)).toThrow(/UAT/)
    expect(() => signUat(p, S)).toThrow(/summary/)
    p.uat.summary = 'Done.'; signUat(p, S)
    setVisit(p, 'W8', { hi: 63 })
    expect(p.uat.signed).toBeUndefined()
    setVisit(p, 'W8', { hi: 64 }); runUat(p, 't'); signUat(p, S)
    expect(() => release(p, 'v1', 'x', S)).toThrow(/1.0/)
    release(p, '1.0', 'First', S)
    expect(p.releases[0].hash).toBe(buildHash(p.build))
    expect(() => release(p, '1.0', 'again', S)).toThrow(/already/)
  })
  test('an exported build imports back unchanged', () => {
    const p = createProject('draft'); p.build = referenceBuild(); finish(p)
    const q = createProject('blank'); importBuild(q, JSON.stringify(exportBuild(p)))
    expect(buildHash(q.build)).toBe(buildHash(p.build))
    expect(q.logForms.sort()).toEqual(p.logForms.sort())
    expect(() => importBuild(q, '{"format":"x"}')).toThrow()
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

describe('documents', () => {
  test('annotated CRF, specification, guidelines and UAT report', () => {
    const p = createProject('draft'); p.build = referenceBuild(); finish(p)
    expect(annotatedCrf(p)).toContain('VS.VSORRES (VSTESTCD = SYSBP)')
    expect(annotatedCrf(p)).toContain('LB.LBORRES (LBTESTCD = HCG)')
    const csv = dvsCsv(p).split('\r\n')
    expect(csv.length).toBe(p.build.checks.length + 1)
    expect(csv.some((l) => l.startsWith('"CM-20"'))).toBe(true)
    expect(ccgHtml(p)).toContain('<h2>')
    expect(uatReport(p)).toContain('Signed by Test User')
  })
})

describe('missions', () => {
  test('M1 scores 100 with the reference build, released', () => {
    const p = startMission('M1', 'guided'); p.build = referenceBuild(); finish(p)
    expect(grade(p)!.score).toBe(100)
    const g = submitMission(p)
    expect(g.passed).toBe(true); expect(p.mission!.score).toBe(100)
  })
  test('the draft scores low', () => {
    const p = startMission('M1', 'standard')
    expect(grade(p)!.score).toBeLessThan(20)
  })
  test('changing a test expectation does not fix a faulty check', () => {
    const p = startMission('M3', 'expert')
    const c = p.build.checks.find((x) => x.id === 'VS-09')!
    setCheck(p, 'VS-09', { tests: c.tests.map((t) => ({ ...t, fire: runOk(t) })) })
    expect(bugFixed(p, 'VS-09')).toBe(false)
    setCheck(p, 'VS-09', { expr: 'DIABP >= SYSBP' })
    expect(bugFixed(p, 'VS-09')).toBe(true)
    function runOk(t: { values: Record<string, string>; fire: boolean }) { return Number(t.values.DIABP) > Number(t.values.SYSBP) }
  })
  test('M2 scores 100 with the reference build, released', () => {
    const p = startMission('M2', 'standard'); importBuild(p, JSON.stringify(referenceBuild())); finish(p)
    expect(grade(p)!.score).toBe(100)
  })
})
