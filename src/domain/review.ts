// Build review: the build against the protocol (ICH M11), against CDASH conventions, against
// the edit checks the protocol calls for, and against what the CDM console can import.
// Every finding names the protocol section or the rule behind it.

import { M11 } from './m11'
import { FORMS as CONSOLE_FORMS, VISITS as CONSOLE_VISITS, CODELISTS as CONSOLE_CODELISTS } from './study'
import { checkErrors, type LabProject, type StudyBuild } from './lab'

export type Sev = 'High' | 'Medium' | 'Low'
export type Area = 'protocol' | 'cdash' | 'checks' | 'console' | 'ccg'
export interface Finding { id: string; area: Area; sev: Sev; where: string; text: string; fix: string; ref: string }
export const AREA_LABEL: Record<Area, string> = { protocol: 'Protocol coverage', cdash: 'CDASH and design', checks: 'Edit checks the protocol needs', console: 'Console import', ccg: 'Completion guidelines' }

// Fields that hold structure rather than data the protocol asks for (visit date, accession numbers).
const STRUCTURAL = new Set(['VISOCCUR', 'VISDAT', 'UNSREAS', 'LBREFID', 'LBTIM', 'PREGCBP', 'PREGTYP', 'EXCOMPL', 'BMI'])
const OPERATIONAL_FORMS: Record<string, string> = { SV: '11.7 (visit occurrence)', DV: '11.10 (protocol deviations are recorded in the eCRF)' }

const visitIds = M11.visits.map((v) => v.id)
const formsAt = (b: StudyBuild, form: string) => b.visits.filter((v) => visitIds.includes(v.id) && v.forms.includes(form)).map((v) => v.id)

export function reviewProtocol(p: LabProject): Finding[] {
  const b = p.build, out: Finding[] = []
  const add = (f: Finding) => out.push(f)
  // Visits.
  for (const sv of M11.visits) {
    const v = b.visits.find((x) => x.id === sv.id)
    if (!v) { add({ id: `P-visit-${sv.id}`, area: 'protocol', sev: 'High', where: sv.name, text: `The schedule of activities has ${sv.name} (study day ${sv.lo} to ${sv.hi}); the build has no ${sv.id} visit.`, fix: 'Add the visit (Schedule: create from the protocol).', ref: 'M11 1.3' }); continue }
    if (v.lo !== sv.lo || v.hi !== sv.hi) add({ id: `P-window-${sv.id}`, area: 'protocol', sev: 'Medium', where: sv.name, text: `The protocol window is study day ${sv.lo} to ${sv.hi}; the build has ${v.lo} to ${v.hi}. The visit window check uses the build's window.`, fix: `Set the window to ${sv.lo} to ${sv.hi}.`, ref: 'M11 1.3' })
    if (!v.forms.includes('SV')) add({ id: `P-sv-${sv.id}`, area: 'protocol', sev: 'High', where: sv.name, text: `${sv.name} has no Visit (SV) form, so its occurrence and date cannot be recorded or windowed.`, fix: 'Add SV to the visit.', ref: 'M11 11.7' })
  }
  if (!b.visits.some((v) => v.id === 'UNS')) add({ id: 'P-uns', area: 'protocol', sev: 'Low', where: 'Unscheduled', text: 'There is no unscheduled visit, so a repeat test or an extra safety visit has nowhere to go.', fix: 'Add an unscheduled visit (UNS) with SV and the forms a repeat assessment needs.', ref: 'Common practice' })
  // Procedures: each is collected on its form, at its visits.
  for (const pr of M11.procedures) {
    const f = b.forms[pr.form]
    if (!f) { add({ id: `P-form-${pr.form}`, area: 'protocol', sev: 'High', where: pr.name, text: `${pr.name} is in the schedule${pr.visits === 'continuous' ? ' (collected throughout)' : ` at ${pr.visits.join(', ')}`}, but the build has no ${pr.form} form.`, fix: `Add the ${pr.form} form${pr.visits === 'continuous' ? ' as a log form' : ' and put it on those visits'}.`, ref: `M11 ${pr.section}` }); continue }
    const missingFields = pr.fields.filter((fid) => !f.fields.some((x) => x.id === fid))
    if (missingFields.length) add({ id: `P-fields-${pr.form}-${pr.id}`, area: 'protocol', sev: 'High', where: `${pr.form}: ${missingFields.join(', ')}`, text: `${pr.name} needs ${missingFields.join(', ')} on ${f.name}; the form does not collect ${missingFields.length === 1 ? 'it' : 'them'}.`, fix: 'Add the fields (the library form has them).', ref: `M11 ${pr.section}` })
    if (pr.visits === 'continuous') {
      if (!p.logForms.includes(pr.form)) add({ id: `P-log-${pr.form}`, area: 'protocol', sev: 'Medium', where: f.name, text: `${pr.name} is collected throughout the trial, but ${f.name} is not a log form.`, fix: 'Make it a log form (collected at any time, repeating).', ref: `M11 ${pr.section}` })
      continue
    }
    const at = formsAt(b, pr.form)
    const miss = pr.visits.filter((v) => !at.includes(v))
    if (miss.length) add({ id: `P-miss-${pr.form}-${miss.join('-')}`, area: 'protocol', sev: 'High', where: `${pr.form} at ${miss.join(', ')}`, text: `${pr.name} is scheduled at ${miss.join(', ')}, but ${f.name} is not on ${miss.length === 1 ? 'that visit' : 'those visits'}.`, fix: `Put ${pr.form} on ${miss.join(', ')}.`, ref: `M11 ${pr.section}` })
  }
  // Forms and fields that no procedure needs.
  for (const [fid, f] of Object.entries(b.forms)) {
    const procs = M11.procedures.filter((x) => x.form === fid)
    const at = formsAt(b, fid)
    if (!procs.length) {
      if (OPERATIONAL_FORMS[fid]) continue
      add({ id: `P-extra-form-${fid}`, area: 'protocol', sev: 'Low', where: f.name, text: `${f.name} (${f.fields.length} fields) is collected but is not in the schedule of activities.`, fix: 'Remove it, unless another section of the protocol or the data management plan needs it.', ref: 'M11 1.3' })
      continue
    }
    const unneeded = f.fields.filter((x) => !STRUCTURAL.has(x.id) && !x.derived && !procs.some((pr) => pr.fields.includes(x.id)))
    if (unneeded.length) add({ id: `P-extra-${fid}-${unneeded.map((x) => x.id).join('-')}`, area: 'protocol', sev: 'Low', where: `${f.name}: ${unneeded.map((x) => x.id).join(', ')}`, text: `${unneeded.map((x) => x.id).join(', ')} ${unneeded.length === 1 ? 'is' : 'are'} collected but no procedure asks for ${unneeded.length === 1 ? 'it' : 'them'}: data burden without a use.`, fix: 'Stop collecting the field (in a new build), or record why it is needed.', ref: procs.map((x) => `M11 ${x.section}`).join('; ') })
    for (const fld of f.fields.filter((x) => !STRUCTURAL.has(x.id) && !x.derived && !unneeded.includes(x))) {
      const need = new Set(procs.filter((pr) => pr.fields.includes(fld.id)).flatMap((pr) => (pr.visits === 'continuous' ? [] : pr.visits)))
      if (!need.size) continue
      const extra = at.filter((v) => !need.has(v))
      const limited = fld.showIf?.field === '__visit' && need.has(fld.showIf.equals) && need.size === 1
      if (extra.length && extra.length < at.length && !limited) add({ id: `P-extra-${fid}-${fld.id}-visits`, area: 'protocol', sev: 'Low', where: `${f.name}: ${fld.id}`, text: `${fld.label} shows at every ${f.name} visit, including ${extra.join(', ')}; the protocol asks for it at ${[...need].join(', ')} only.`, fix: need.size === 1 ? `Show it only at ${[...need][0]} (show-if __visit = ${[...need][0]}).` : 'Collect it only where the protocol asks, or document why.', ref: procs.filter((pr) => pr.fields.includes(fld.id)).map((pr) => `M11 ${pr.section}`).join('; ') })
    }
  }
  // Eligibility criteria the eCRF must be able to record.
  const iefield = b.forms.IE?.fields.find((x) => x.id === 'IETESTCD')
  const codes = new Set((iefield?.codelist ? b.codelists[iefield.codelist] ?? [] : []).map((c) => c.value))
  if (b.forms.IE) for (const c of [...M11.inclusion, ...M11.exclusion]) if (!codes.has(c.code)) add({ id: `P-crit-${c.code}`, area: 'protocol', sev: 'High', where: c.code, text: `${c.code} "${c.text}" is not in the list of criteria not met, so a participant who fails it cannot be recorded.`, fix: `Add ${c.code} to the ${iefield?.codelist ?? 'criteria'} codelist.`, ref: c.code.startsWith('IN') ? 'M11 5.2' : 'M11 5.3' })
  return out
}

export function reviewCdash(p: LabProject): Finding[] {
  const b = p.build, out: Finding[] = []
  const add = (f: Omit<Finding, 'area'>) => out.push({ area: 'cdash', ...f })
  for (const [fid, f] of Object.entries(b.forms)) {
    if (!f.fields.length) add({ id: `C-empty-${fid}`, sev: 'High', where: f.name, text: `${f.name} has no fields.`, fix: 'Add fields or remove the form.', ref: 'Design' })
    if (!/^[A-Z]{2}$/.test(f.domain)) add({ id: `C-domain-${fid}`, sev: 'Medium', where: f.name, text: `Domain "${f.domain}" is not a two-letter SDTM domain code.`, fix: 'Use the domain the data map to (VS, LB, AE, ...).', ref: 'CDASHIG v2.3, section 2' })
    const onVisits = b.visits.some((v) => v.forms.includes(fid))
    if (!onVisits && !p.logForms.includes(fid)) add({ id: `C-orphan-${fid}`, sev: 'Medium', where: f.name, text: `${f.name} is on no visit and is not a log form, so it can never be entered.`, fix: 'Schedule it at its visits or make it a log form.', ref: 'Design' })
    const seen = new Set<string>()
    for (const fld of f.fields) {
      const w = `${fid}.${fld.id}`
      if (seen.has(fld.id)) add({ id: `C-dup-${w}`, sev: 'High', where: w, text: `${fld.id} appears twice on ${f.name}.`, fix: 'Rename or remove one.', ref: 'Design' })
      seen.add(fld.id)
      if (!/^[A-Z][A-Z0-9]{0,7}$/.test(fld.id)) add({ id: `C-name-${w}`, sev: 'Medium', where: w, text: `"${fld.id}" is not a valid variable name (1 to 8 capital letters or digits, starting with a letter).`, fix: 'Use a CDASH variable name.', ref: 'CDASHIG v2.3, variable naming' })
      if (fld.type === 'date' && !/DAT$|DAT\d?$/.test(fld.id)) add({ id: `C-date-${w}`, sev: 'Low', where: w, text: `${fld.id} is a date but does not end in DAT, as CDASH collection dates do.`, fix: `For example ${fld.id.replace(/DTC$|DT$/, '')}DAT.`, ref: 'CDASHIG v2.3 (dates collected as --DAT)' })
      if ((fld.type === 'select' || fld.type === 'yn') && !fld.codelist) add({ id: `C-cl-${w}`, sev: 'High', where: w, text: `${fld.id} is a ${fld.type === 'yn' ? 'yes/no' : 'pick-list'} field without a codelist.`, fix: fld.type === 'yn' ? 'Use NY.' : 'Attach a codelist.', ref: 'CDISC Controlled Terminology' })
      if (fld.codelist && !b.codelists[fld.codelist]) add({ id: `C-clmiss-${w}`, sev: 'High', where: w, text: `${fld.id} uses codelist ${fld.codelist}, which is not in the build.`, fix: `Add codelist ${fld.codelist}.`, ref: 'Design' })
      if (fld.codelist && b.codelists[fld.codelist] && !b.codelists[fld.codelist].length) add({ id: `C-clempty-${w}`, sev: 'High', where: w, text: `Codelist ${fld.codelist} has no values.`, fix: 'Add the values.', ref: 'Design' })
      if (fld.type === 'number' && !fld.unit && !/YR|CNT|Q$|NUM|COMPL/.test(fld.id) && !fld.derived) add({ id: `C-unit-${w}`, sev: 'Low', where: w, text: `${fld.label} is a number without a unit.`, fix: 'Show the unit, or add a unit field when sites report different units.', ref: 'CDASHIG v2.3 (--ORRESU)' })
      if (fld.showIf && fld.showIf.field !== '__visit' && !f.fields.some((x) => x.id === fld.showIf!.field)) add({ id: `C-show-${w}`, sev: 'High', where: w, text: `${fld.id} shows when ${fld.showIf.field} = ${fld.showIf.equals}, but ${fld.showIf.field} is not on the form.`, fix: 'Point the condition at a field of this form.', ref: 'Design' })
      if (fld.showIf?.field === '__visit' && !b.visits.some((v) => v.id === fld.showIf!.equals)) add({ id: `C-showv-${w}`, sev: 'High', where: w, text: `${fld.id} shows only at visit ${fld.showIf.equals}, which is not in the build.`, fix: 'Use an existing visit ID.', ref: 'Design' })
      if (fld.required && fld.derived) add({ id: `C-reqder-${w}`, sev: 'Medium', where: w, text: `${fld.id} is derived but marked required: sites cannot enter a derived value.`, fix: 'Clear "required" on derived fields.', ref: 'Design' })
    }
  }
  for (const [cid, list] of Object.entries(b.codelists)) {
    const vals = list.map((x) => x.value)
    if (new Set(vals).size !== vals.length) out.push({ id: `C-cldup-${cid}`, area: 'cdash', sev: 'High', where: `Codelist ${cid}`, text: `Codelist ${cid} repeats a value.`, fix: 'Remove the duplicate.', ref: 'Design' })
    if (!Object.values(b.forms).some((f) => f.fields.some((x) => x.codelist === cid))) out.push({ id: `C-clunused-${cid}`, area: 'cdash', sev: 'Low', where: `Codelist ${cid}`, text: `Codelist ${cid} is not used by any field.`, fix: 'Remove it or attach it.', ref: 'Design' })
  }
  return out
}

// The core edit checks the protocol implies, and whether the build has one.
const CHECKABLE = new Set(['IN01', 'IN02', 'EX03', 'EX04'])
export interface NeedCheck { id: string; ref: string; text: string; covered: string[] }
export function neededChecks(p: LabProject): NeedCheck[] {
  const b = p.build, out: NeedCheck[] = []
  const by = (pred: (c: StudyBuild['checks'][number]) => boolean) => b.checks.filter((c) => c.active && pred(c)).map((c) => c.id)
  out.push({ id: 'N-window', ref: 'M11 1.3', text: 'Visit date outside the protocol window (uses each visit\'s window)', covered: by((c) => c.form === 'SV' && /winlo\(\)|winhi\(\)/.test(c.expr)) })
  out.push({ id: 'N-consent', ref: 'M11 11.3', text: 'A visit or procedure dated before informed consent', covered: by((c) => /consent\(\)/.test(c.expr)) })
  // Criteria the collected data can test (EX01 secondary hypertension and EX02 eGFR rest on medical
  // review and source documents: the eCRF holds no field that decides them).
  for (const c of [...M11.inclusion, ...M11.exclusion].filter((x) => CHECKABLE.has(x.code))) out.push({ id: `N-${c.code}`, ref: c.code.startsWith('IN') ? 'M11 5.2' : 'M11 5.3', text: `Eligible, but ${c.code} is not met: ${c.text}`, covered: by((x) => `${x.expr} ${x.title} ${x.message}`.includes(c.code)) })
  out.push({ id: 'N-sysbp', ref: 'M11 8.4.2', text: 'Systolic blood pressure outside a plausible range', covered: by((c) => c.form === 'VS' && c.category === 'range' && /SYSBP/.test(c.expr)) })
  out.push({ id: 'N-diabp', ref: 'M11 8.4.2', text: 'Diastolic blood pressure outside a plausible range', covered: by((c) => c.form === 'VS' && c.category === 'range' && /DIABP/.test(c.expr)) })
  out.push({ id: 'N-k', ref: 'M11 8.4.4, 12.1', text: 'Potassium above 5.5 mmol/L (safety follow-up)', covered: by((c) => c.form === 'LB' && /\bK\b/.test(c.expr) && /5\.5/.test(c.expr)) })
  out.push({ id: 'N-sae', ref: 'M11 9.2.1', text: 'A serious AE with no seriousness criterion ticked', covered: by((c) => c.form === 'AE' && /AESER/.test(c.expr) && /any\(/.test(c.expr)) })
  out.push({ id: 'N-aedate', ref: 'M11 9.2.1', text: 'An AE end date before its start date', covered: by((c) => c.form === 'AE' && /AEENDAT/.test(c.expr) && /AESTDAT/.test(c.expr)) })
  if (b.forms.PREG) out.push({ id: 'N-preg', ref: 'M11 8.4.5', text: 'A positive pregnancy test (stop dosing, report)', covered: by((c) => c.form === 'PREG' && /PREGRES/.test(c.expr) && /POSITIVE/.test(c.expr)) })
  // A missing-value check for every required field the protocol needs.
  for (const pr of M11.procedures) {
    const f = b.forms[pr.form]; if (!f) continue
    for (const fid of pr.fields) {
      const fld = f.fields.find((x) => x.id === fid)
      if (!fld?.required) continue
      out.push({ id: `N-miss-${pr.form}-${fid}`, ref: `M11 ${pr.section}`, text: `${fld.label} missing on ${f.name}`, covered: by((c) => c.form === pr.form && c.field === fid && c.category === 'missing') })
    }
  }
  return out
}

export function reviewChecks(p: LabProject): Finding[] {
  const out: Finding[] = []
  for (const n of neededChecks(p)) if (!n.covered.length) out.push({ id: `K-${n.id}`, area: 'checks', sev: n.id.startsWith('N-miss') ? 'Medium' : 'High', where: n.text, text: `No active edit check covers: ${n.text}.`, fix: 'Program a check with a firing and a passing test case.', ref: n.ref })
  const ids = new Set<string>()
  for (const c of p.build.checks) {
    if (ids.has(c.id)) out.push({ id: `K-dup-${c.id}`, area: 'checks', sev: 'High', where: c.id, text: `Check ID ${c.id} is used twice.`, fix: 'Give each check its own ID.', ref: 'Data validation specification' })
    ids.add(c.id)
    const err = checkErrors(p.build, c)
    if (err) out.push({ id: `K-err-${c.id}`, area: 'checks', sev: 'High', where: c.id, text: `${c.id}: ${err}`, fix: 'Correct the logic.', ref: 'Data validation specification' })
    if (!c.message.trim()) out.push({ id: `K-msg-${c.id}`, area: 'checks', sev: 'Medium', where: c.id, text: `${c.id} has no query text.`, fix: 'Write a neutral query: say what is wrong and ask the site to check the source.', ref: 'Query writing' })
    else if (/\b(change|correct) (it|the value) to\b|\bplease enter\s+\d/i.test(c.message)) out.push({ id: `K-lead-${c.id}`, area: 'checks', sev: 'Medium', where: c.id, text: `${c.id}'s query text tells the site what value to enter (a leading query).`, fix: 'Ask the site to verify against the source instead.', ref: 'ICH E6(R3) data integrity; query writing' })
    if (!c.tests.some((t) => t.fire) || !c.tests.some((t) => !t.fire)) out.push({ id: `K-tests-${c.id}`, area: 'checks', sev: 'Medium', where: c.id, text: `${c.id} needs at least one test case that fires and one that does not.`, fix: 'Add the missing test case.', ref: 'UAT' })
  }
  return out
}

// What the console's importer will say (mirrors checkBuild in the console's build.ts).
export function reviewConsole(p: LabProject): Finding[] {
  const b = p.build, out: Finding[] = []
  const add = (sev: Sev, id: string, where: string, text: string, fix: string) => out.push({ id: `X-${id}`, area: 'console', sev, where, text, fix, ref: 'CDM console import (cdm-study-build v1)' })
  for (const v of CONSOLE_VISITS) {
    const n = b.visits.find((x) => x.id === v.id)
    if (!n) { add('High', `visit-${v.id}`, v.name, `The console's simulated sites enter visit ${v.id}; the build has no such visit, so the console will refuse the file.`, 'Keep the visit.'); continue }
    for (const f of v.forms) if (!n.forms.includes(f) && b.forms[f]) add('High', `vf-${v.id}-${f}`, `${v.id}: ${f}`, `The sites enter ${f} at ${v.id}; the build drops it there, so the console will refuse the file.`, `Keep ${f} at ${v.id}.`)
  }
  for (const [id, f] of Object.entries(CONSOLE_FORMS)) {
    const n = b.forms[id]
    if (!n) { add('High', `form-${id}`, f.name, `The console's sites enter ${f.name}; the build has no ${id} form, so the console will refuse the file.`, `Add ${id} (from the library).`); continue }
    for (const fld of f.fields) {
      const m = n.fields.find((x) => x.id === fld.id)
      if (!m) add('High', `field-${id}-${fld.id}`, `${id}.${fld.id}`, `The sites' data include ${id}.${fld.id}; removing it makes the console refuse the file. A field can be dropped in a new study, not mid-study.`, 'Keep the field (you can stop asking for it at visits where it is not needed).')
      else if (m.type !== fld.type) add('High', `type-${id}-${fld.id}`, `${id}.${fld.id}`, `${id}.${fld.id} changes type from ${fld.type} to ${m.type}; the entered data would no longer fit.`, `Keep the type ${fld.type}.`)
    }
  }
  for (const [id, list] of Object.entries(CONSOLE_CODELISTS)) {
    const n = b.codelists[id]
    if (!n) { if (Object.values(b.forms).some((f) => f.fields.some((x) => x.codelist === id))) add('High', `cl-${id}`, id, `Codelist ${id} is missing.`, 'Add it back.'); continue }
    for (const v of list) if (!n.some((x) => x.value === v.value)) add('High', `clv-${id}-${v.value}`, id, `Codelist ${id} drops ${v.value}, which entered data use.`, 'Keep the value; add new ones instead.')
  }
  for (const id of Object.keys(b.forms)) if (!CONSOLE_FORMS[id]) add('Low', `new-${id}`, id, `${id} is new to the console: it will accept it, but its simulated sites do not enter it. Enter it yourself in the casebook.`, 'Nothing to fix.')
  return out
}

export function reviewCcg(p: LabProject): Finding[] {
  const out: Finding[] = []
  for (const [fid, f] of Object.entries(p.build.forms)) if (!(p.build.ccg.forms[fid] ?? []).some((x) => x.trim())) out.push({ id: `G-${fid}`, area: 'ccg', sev: 'Low', where: f.name, text: `${f.name} has no CRF completion guidelines.`, fix: 'Write the form-level instructions sites follow.', ref: 'Data management plan 4.1' })
  return out
}

export function review(p: LabProject) {
  const all = [...reviewProtocol(p), ...reviewCdash(p), ...reviewChecks(p), ...reviewConsole(p), ...reviewCcg(p)]
  const by = (s: Sev) => all.filter((f) => f.sev === s).length
  const blocking = all.filter((f) => f.sev === 'High')
  return { all, high: by('High'), medium: by('Medium'), low: by('Low'), ready: blocking.length === 0, score: Math.max(0, 100 - 6 * by('High') - 2 * by('Medium')) }
}
