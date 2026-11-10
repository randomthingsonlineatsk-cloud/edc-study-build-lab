// Build documents: the annotated CRF, the data validation specification and the CRF completion
// guidelines, written from the build.
import type { LabProject, StudyBuild } from './lab'
import { CATEGORY_LABEL } from './checks'

// The SDTM variable a collected field maps to (shown on the annotated CRF).
const SDTM: Record<string, string> = {
  EXDSPQ: 'DA.DAORRES (DATESTCD = DISPAMT)', EXRET: 'DA.DAORRES (DATESTCD = RETAMT)', EXCOMPL: 'Derived for review (not submitted)', UNSREAS: 'SV.SVREASOC', VISDAT: 'SV.SVSTDTC', VISOCCUR: 'Not submitted (drives SV)',
  DVSTDAT: 'DV.DVSTDTC', DVIMPT: 'DV.DVCAT', LBREFID: 'LB.LBREFID', LBTIM: 'LB.LBDTC (time part)', LBPERF: 'LB.LBSTAT (NOT DONE when No)', DSSTDAT: 'DS.DSSTDTC (DSDECOD = INFORMED CONSENT OBTAINED)', ICVER: 'Not submitted (consent version)',
  BRTHYR: 'DM.BRTHDTC', SYSBP: 'VS.VSORRES (VSTESTCD = SYSBP)', DIABP: 'VS.VSORRES (VSTESTCD = DIABP)', PULSE: 'VS.VSORRES (VSTESTCD = PULSE)', WEIGHT: 'VS.VSORRES (VSTESTCD = WEIGHT)', HEIGHT: 'VS.VSORRES (VSTESTCD = HEIGHT)', BMI: 'VS.VSORRES (VSTESTCD = BMI)',
  GLUC: 'LB.LBORRES (LBTESTCD = GLUC)', GLUCU: 'LB.LBORRESU', K: 'LB.LBORRES (LBTESTCD = K)', CREAT: 'LB.LBORRES (LBTESTCD = CREAT)', ALT: 'LB.LBORRES (LBTESTCD = ALT)', QTCF: 'EG.EGORRES (EGTESTCD = QTCFAG)', EGINTP: 'EG.EGORRES (EGTESTCD = INTP)',
  EOSDAT: 'DS.DSSTDTC', AESTDAT: 'AE.AESTDTC', AEENDAT: 'AE.AEENDTC', CMSTDAT: 'CM.CMSTDTC', CMENDAT: 'CM.CMENDTC', CMDSTXT: 'CM.CMDOSE', MHSTDAT: 'MH.MHSTDTC', VSDAT: 'VS.VSDTC', LBDAT: 'LB.LBDTC', EGDAT: 'EG.EGDTC', IETESTCD: 'IE.IETESTCD', IEYN: 'Not submitted (IE records only criteria not met)',
  PREGCBP: 'RP.RPORRES (RPTESTCD = CHILDPOT)', PREGDAT: 'LB.LBDTC', PREGTYP: 'LB.LBSPEC', PREGRES: 'LB.LBORRES (LBTESTCD = HCG)', AEONGO: 'AE.AEENRTPT (ONGOING when Yes)', CMONGO: 'CM.CMENRTPT (ONGOING when Yes)', MHONGO: 'MH.MHENRTPT (ONGOING when Yes)',
}
export const sdtmOf = (b: StudyBuild, form: string, field: string) => SDTM[field] ?? `${b.forms[form]?.domain ?? form}.${field}`

const h = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const page = (title: string, body: string, b: StudyBuild) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:64rem;margin:2rem auto;padding:0 1rem;color:#1d2433;background:#fff}h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:2rem;border-bottom:2px solid #1d2433}table{border-collapse:collapse;width:100%;margin:.5rem 0}th,td{border:1px solid #c8ccd4;padding:.3rem .45rem;text-align:left;vertical-align:top;font-size:.85rem}th{background:#eef0f4}.ann{color:#b4231b;font-family:ui-monospace,monospace;font-size:.8rem}.note{background:#fff7e0;border:1px solid #e8c770;padding:.5rem .7rem;font-size:.85rem}@media print{h2{break-before:page}}</style></head><body>
<p class="note">Training material. Fictional protocol ${h(b.study.protocol)}; build ${h(b.study.buildVersion)}. Not for real use.</p><h1>${h(title)}</h1>${body}</body></html>`

export function annotatedCrf(p: LabProject): string {
  const b = p.build
  const body = Object.values(b.forms).map((f) => {
    const at = p.logForms.includes(f.id) ? 'Log form, collected at any time' : `Visits: ${b.visits.filter((v) => v.forms.includes(f.id)).map((v) => v.id).join(', ') || 'none'}`
    const rows = f.fields.map((x) => `<tr><td>${h(x.label)}${x.required ? ' *' : ''}${x.unit ? ` (${h(x.unit)})` : ''}${x.showIf ? `<br><small>Shown when ${x.showIf.field === '__visit' ? 'the visit is' : h(x.showIf.field) + ' ='} ${h(x.showIf.equals)}</small>` : ''}</td><td>${x.type === 'yn' || x.type === 'select' ? (b.codelists[x.codelist ?? ''] ?? []).map((c) => `○ ${h(c.label)} <span class="ann">[${h(c.value)}]</span>`).join('<br>') : h(x.type)}</td><td class="ann">${h(x.id)}<br>${h(sdtmOf(b, f.id, x.id))}</td></tr>`).join('')
    return `<h2>${h(f.name)} <span class="ann">(${h(f.id)}; SDTM ${h(f.domain)})</span></h2><p>${h(at)}${f.repeating ? '. Repeating.' : '.'}</p><table><thead><tr><th>Question</th><th>Response</th><th>Annotation (CDASH variable; SDTM target)</th></tr></thead><tbody>${rows}</tbody></table>`
  }).join('')
  return page(`Annotated CRF, ${b.study.protocol}`, body, b)
}

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
export function dvsCsv(p: LabProject): string {
  const head = ['Check ID', 'Title', 'Category', 'Form', 'Target field', 'Visits', 'Logic', 'Query text', 'Active', 'Test cases']
  return [head.map(q).join(','), ...p.build.checks.map((c) => [c.id, c.title, CATEGORY_LABEL[c.category], c.form, c.field, (c.visits ?? []).join(' '), c.expr, c.message, c.active ? 'Yes' : 'No',
    c.tests.map((t) => `${t.name}: ${Object.entries(t.values).map(([k, v]) => `${k}=${v}`).join('; ')}${t.ctx ? ` | ${Object.entries(t.ctx).map(([k, v]) => `${k}=${v}`).join('; ')}` : ''} -> ${t.fire ? 'fires' : 'passes'}`).join(' || ')].map(q).join(','))].join('\r\n')
}

export function ccgHtml(p: LabProject): string {
  const b = p.build
  const body = `<h2>General</h2><ul>${b.ccg.general.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` + Object.values(b.forms).map((f) => {
    const lines = (b.ccg.forms[f.id] ?? []).filter((x) => x.trim())
    const fl = f.fields.filter((x) => b.ccg.fields?.[`${f.id}.${x.id}`]).map((x) => `<li><b>${h(x.label)}</b>: ${h(b.ccg.fields![`${f.id}.${x.id}`])}</li>`).join('')
    return `<h2>${h(f.name)}</h2>${lines.length ? `<ul>${lines.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : '<p>No instructions.</p>'}${fl ? `<ul>${fl}</ul>` : ''}`
  }).join('')
  return page(`CRF completion guidelines, ${b.study.protocol}`, body, b)
}

export function uatReport(p: LabProject): string {
  const u = p.uat
  const rows = u.runs.map((s) => `<tr><td>${h(s.checkId)}</td><td>${h(s.test)}</td><td>${s.expected ? 'Fires' : 'Passes'}</td><td>${s.actual === 'error' ? 'Error' : s.actual ? 'Fired' : 'Did not fire'}</td><td>${s.actual === s.expected ? 'Pass' : '<b>FAIL</b>'}</td></tr>`).join('')
  const issues = u.issues.map((i) => `<tr><td>${h(i.checkId)}</td><td>${h(i.text)}</td><td>${h(i.status)}</td><td>${h(i.resolution ?? '')}</td></tr>`).join('')
  const body = `<h2>Summary</h2><p>${h(u.summary ?? '(none)')}</p><p>${u.signed ? `Signed by ${h(u.signed.name)} (${h(u.signed.role)}), ${h(u.signed.utc)}: ${h(u.signed.meaning)}` : 'Not signed.'}</p><h2>Issues</h2><table><thead><tr><th>Check</th><th>Issue</th><th>Status</th><th>Resolution</th></tr></thead><tbody>${issues || '<tr><td colspan="4">None</td></tr>'}</tbody></table><h2>Test log</h2><table><thead><tr><th>Check</th><th>Test</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`
  return page(`UAT report, ${p.build.study.protocol}`, body, p.build)
}
