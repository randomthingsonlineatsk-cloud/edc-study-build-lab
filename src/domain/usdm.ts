// The protocol as a digital protocol, and an automated first-pass build from it.
//
// CDISC's Unified Study Definitions Model (USDM, version 4 released June 2025) holds a protocol
// as data: the study version, its design, encounters (visits), activities (procedures) linked to
// biomedical concepts, the schedule timeline with timings and windows, and eligibility criteria.
// ICH M11's technical specification and USDM are aligned, so a protocol written in M11 can be
// exchanged as USDM. Tools can then draft the EDC build from it.
//
// The file this lab writes follows the USDM v4 class and attribute names for the parts a build
// needs; it is a teaching subset, not a conformant USDM file, and its terms are not real CDISC
// controlled terminology codes. The generator below drafts a build the way such tools do, with
// the misses that automation typically makes; the learner reviews and fixes them.
import { protocolOf, M11, type ProtocolDef } from './m11'
import { LIBRARY, LIBRARY_CODELISTS, createProject, missingCheck, PROTOCOL_ID, BUILD_FORMAT, type LabProject, type StudyBuild } from './lab'
import { CCG_GENERAL } from './dmp'

const code = (decode: string, c = '') => ({ id: `Code_${decode.replace(/\W+/g, '_')}`, code: c || decode.toUpperCase().replace(/\W+/g, '_'), codeSystem: 'edc-study-build-lab (teaching terms)', codeSystemVersion: '1', decode, instanceType: 'Code' })
const dur = (n: number) => `P${Math.abs(n)}D`
const BC: Record<string, { name: string; form: string }> = {
  P01: { name: 'Informed Consent Obtained', form: 'IC' }, P02: { name: 'Demographics', form: 'DM' }, P03: { name: 'Eligibility Criteria Not Met', form: 'IE' },
  P04: { name: 'Medical History', form: 'MH' }, P05: { name: 'Vital Signs (Blood Pressure, Pulse)', form: 'VS' }, P06: { name: 'Body Weight', form: 'VS' }, P07: { name: 'Body Height', form: 'VS' },
  P08: { name: 'Local Safety Laboratory Panel', form: 'LB' }, P09: { name: 'Central Laboratory Sample', form: 'LBC' }, P10: { name: '12-Lead ECG', form: 'EG' },
  P11: { name: 'Pregnancy Test (Choriogonadotropin Beta)', form: '' }, // no CDASH form mapped in the generator's library
  P12: { name: 'Study Drug Dispensing and Accountability', form: 'EX' }, P13: { name: 'Adverse Event', form: 'AE' }, P14: { name: 'Concomitant Medication', form: 'CM' }, P15: { name: 'Disposition', form: 'EOS' },
}

// ---------- the digital protocol ----------
export function usdmOf(pr: ProtocolDef = protocolOf({})) {
  const encs = pr.visits.map((v) => ({ id: `Encounter_${v.id}`, name: v.id, label: v.name, description: v.name, type: code('Visit'), instanceType: 'Encounter' }))
  const inst = (id: string) => `SAI_${id}`
  const timings = pr.visits.filter((v) => v.id !== 'D1').map((v) => {
    const nominal = v.id === 'SCR' ? -14 : Math.round((v.lo + v.hi) / 2)
    const before = nominal < 1
    return { id: `Timing_${v.id}`, name: `${v.id} timing`, type: code(before ? 'Before' : 'After'), value: dur(before ? 1 - nominal - 1 : nominal - 1), valueLabel: `Day ${nominal}`,
      relativeToFrom: code('Start to Start'), relativeFromScheduledInstanceId: inst(v.id), relativeToScheduledInstanceId: inst('D1'),
      windowLower: dur(nominal - v.lo), windowUpper: dur(v.hi - nominal), windowLabel: `Day ${v.lo} to ${v.hi}`, instanceType: 'Timing' }
  })
  const continuous = (p: (typeof pr.procedures)[number]) => p.visits === 'continuous'
  // Adverse events and medications are collected from informed consent (section 9.2.1, which governs
  // over the schedule footnote), so they are scheduled from screening, as in the Protocol Builder.
  const activityIdsAt = (vid: string) => pr.procedures.filter((p) => (continuous(p) ? true : (p.visits as string[]).includes(vid))).map((p) => `Activity_${p.id}`)
  return {
    usdmVersion: '4.0.0', systemName: 'EDC Study Build Lab', systemVersion: '1',
    study: {
      id: 'Study_1', name: PROTOCOL_ID, instanceType: 'Study',
      versions: [{
        id: 'StudyVersion_1', versionIdentifier: pr.version, rationale: pr.amendment ? pr.amendment.summary : 'Protocol version 2.0 (amendment 1).', instanceType: 'StudyVersion',
        titles: [{ id: 'StudyTitle_1', text: M11.title['Full Title'], type: code('Official Study Title'), instanceType: 'StudyTitle' }, { id: 'StudyTitle_2', text: M11.title['Trial Acronym'], type: code('Study Acronym'), instanceType: 'StudyTitle' }],
        studyIdentifiers: [{ id: 'StudyIdentifier_1', text: PROTOCOL_ID, scopeId: 'Organization_1', instanceType: 'StudyIdentifier' }],
        organizations: [{ id: 'Organization_1', name: 'Halvern Therapeutics (fictional)', type: code('Clinical Study Sponsor'), instanceType: 'Organization' }],
        eligibilityCriterionItems: [...pr.inclusion, ...pr.exclusion].map((c) => ({ id: `ECI_${c.code}`, name: c.code, text: c.text, instanceType: 'EligibilityCriterionItem' })),
        biomedicalConcepts: pr.procedures.map((p) => ({ id: `BC_${p.id}`, name: BC[p.id]?.name ?? p.name, label: BC[p.id]?.name ?? p.name, synonyms: [], reference: '', properties: p.fields.map((f) => ({ id: `BCP_${p.id}_${f}`, name: f, label: f, isRequired: true, isEnabled: true, datatype: 'string', instanceType: 'BiomedicalConceptProperty' })), code: { id: `AC_${p.id}`, standardCode: code(BC[p.id]?.name ?? p.name), instanceType: 'AliasCode' }, instanceType: 'BiomedicalConcept' })),
        studyDesigns: [{
          id: 'StudyDesign_1', name: 'VASCLEAR-2 design', instanceType: 'InterventionalStudyDesign', model: code('Parallel Study'),
          encounters: encs,
          activities: pr.procedures.map((p) => ({ id: `Activity_${p.id}`, name: p.name, label: p.name, description: `Protocol section ${p.section}`, biomedicalConceptIds: [`BC_${p.id}`], notes: p.note ? [{ id: `Note_${p.id}`, text: p.note, instanceType: 'CommentAnnotation' }] : [], instanceType: 'Activity' })),
          eligibilityCriteria: [...pr.inclusion.map((c) => ({ c, cat: 'Inclusion Criteria' })), ...pr.exclusion.map((c) => ({ c, cat: 'Exclusion Criteria' }))].map(({ c, cat }) => ({ id: `EC_${c.code}`, name: c.code, identifier: c.code, category: code(cat), criterionItemId: `ECI_${c.code}`, instanceType: 'EligibilityCriterion' })),
          scheduleTimelines: [{ id: 'Timeline_1', name: 'Main timeline', mainTimeline: true, entryCondition: 'Informed consent signed', entryId: inst('SCR'), instanceType: 'ScheduleTimeline',
            instances: pr.visits.map((v, i) => ({ id: inst(v.id), name: v.id, encounterId: `Encounter_${v.id}`, activityIds: activityIdsAt(v.id), defaultConditionId: pr.visits[i + 1] ? inst(pr.visits[i + 1].id) : null, instanceType: 'ScheduledActivityInstance' })),
            timings }],
        }],
      }],
    },
  }
}
export type Usdm = ReturnType<typeof usdmOf>

// ---------- the automated first-pass build ----------
// The generator maps each activity's biomedical concept to a CDASH form in its library by the
// concept's name; a concept it does not know becomes a generic form made from the concept's
// properties. For HLV-204-201 it keeps its historic mapping by procedure (with the pregnancy test
// deliberately unmapped). Any protocol can be built: a USDM v4 file written in the Protocol
// Builder, for example, drafts a build for that protocol, and the project keeps the protocol so
// the build review checks against it.
const CONCEPT_FORM: Record<string, string> = {
  'Informed Consent Obtained': 'IC', Demographics: 'DM', 'Eligibility Criteria Not Met': 'IE', 'Medical History': 'MH', 'Vital Signs (Blood Pressure, Pulse)': 'VS',
  'Body Weight': 'VS', 'Body Height': 'VS', 'Local Safety Laboratory Panel': 'LB', 'Central Laboratory Sample': 'LBC', '12-Lead ECG': 'EG',
  'Study Drug Dispensing and Accountability': 'EX', 'Adverse Event': 'AE', 'Concomitant Medication': 'CM', Disposition: 'EOS',
}
const CONTINUOUS = new Set(['AE', 'CM'])
const days = (d?: string | null) => (d == null ? 0 : Number(/^P(\d+)D$/.exec(d)?.[1] ?? NaN))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyUsdm = any
const formFor = (isHlv: boolean, pid: string, concept?: string) => (isHlv ? BC[pid]?.form ?? '' : CONCEPT_FORM[concept ?? ''] ?? '')


// What an activity measures: its biomedical concept category (a Protocol Builder file groups the
// CDISC concepts of each procedure in one), a surrogate (for a concept the CDISC library lacks), or
// its first biomedical concept; and the CDASH fields, from the activity's extension when present.
const CDASH_EXT = /\/ext\/cdash-fields$/
function conceptOf(v: AnyUsdm, a: AnyUsdm): { name?: string; fields: string[] } {
  const cat = (v.bcCategories ?? []).find((c: AnyUsdm) => c.id === a.bcCategoryIds?.[0])
  const sur = (v.bcSurrogates ?? []).find((c: AnyUsdm) => c.id === a.bcSurrogateIds?.[0])
  const bc = (v.biomedicalConcepts ?? []).find((x: AnyUsdm) => x.id === a.biomedicalConceptIds?.[0])
  const ext = (a.extensionAttributes ?? []).find((x: AnyUsdm) => CDASH_EXT.test(x.url ?? ''))
  const fields = ext?.valueString ? String(ext.valueString).split(',').filter(Boolean) : (bc?.properties ?? []).map((x: AnyUsdm) => x.name)
  return { name: cat?.name ?? sur?.name ?? bc?.name, fields }
}

// The protocol as the USDM file states it (read correctly, unlike the generator below).
export function protocolFromUsdm(u: AnyUsdm): ProtocolDef {
  const v = u.study.versions[0], d = v.studyDesigns[0], tl = d.scheduleTimelines.find((t: AnyUsdm) => t.mainTimeline) ?? d.scheduleTimelines[0]
  const anchorDay = 1
  const visits = d.encounters.map((e: AnyUsdm) => {
    const si = tl.instances.find((x: AnyUsdm) => x.encounterId === e.id), t = tl.timings.find((x: AnyUsdm) => x.relativeFromScheduledInstanceId === si?.id)
    const kind = t?.type?.decode, n = t ? days(t.value) : 0
    const day = !t || kind === 'Fixed Reference' ? anchorDay : kind === 'Before' ? anchorDay - n - 1 : anchorDay + n
    return { id: e.name, name: e.label || e.name, lo: day - (t ? days(t.windowLower) : 0), hi: day + (t ? days(t.windowUpper) : 0) }
  })
  const procedures = d.activities.map((a: AnyUsdm) => {
    const pid = String(a.id).replace('Activity_', ''), c = conceptOf(v, a)
    const form = formFor(false, pid, c.name) || `F${pid.replace(/^P/, '')}`
    const at = tl.instances.filter((x: AnyUsdm) => x.activityIds.includes(a.id)).map((x: AnyUsdm) => d.encounters.find((e: AnyUsdm) => e.id === x.encounterId)?.name).filter(Boolean)
    return { id: pid, name: a.name, section: String(a.description ?? '').replace(/^Protocol section /, ''), form, fields: c.fields, visits: CONTINUOUS.has(form) ? 'continuous' as const : at, note: a.notes?.[0]?.text }
  })
  const crit = d.eligibilityCriteria.map((c: AnyUsdm) => ({ code: c.identifier, text: v.eligibilityCriterionItems.find((i: AnyUsdm) => i.id === c.criterionItemId)?.text ?? '', cat: c.category?.decode ?? '' }))
  const titlePage: Record<string, string> = { 'Full Title': v.titles?.[0]?.text ?? '', 'Sponsor Protocol Identifier': v.studyIdentifiers?.[0]?.text ?? '' }
  const acr = v.titles?.find((t: AnyUsdm) => /Acronym/.test(t.type?.decode ?? ''))?.text; if (acr) titlePage['Trial Acronym'] = acr
  if (d.studyPhase?.standardCode?.decode) titlePage['Trial Phase'] = d.studyPhase.standardCode.decode
  if (d.blindingSchema?.standardCode?.decode) titlePage['Trial Blind Schema'] = d.blindingSchema.standardCode.decode
  if (v.organizations?.[0]?.name) titlePage['Sponsor'] = v.organizations[0].name
  return {
    id: titlePage['Sponsor Protocol Identifier'], version: v.versionIdentifier ?? '1', visits, procedures,
    inclusion: crit.filter((c: AnyUsdm) => /Inclusion/i.test(c.cat) || /^IN/.test(c.code)).map(({ code, text }: AnyUsdm) => ({ code, text })),
    exclusion: crit.filter((c: AnyUsdm) => !(/Inclusion/i.test(c.cat) || /^IN/.test(c.code))).map(({ code, text }: AnyUsdm) => ({ code, text })),
    statements: [], kThreshold: NaN, titlePage,
    objectives: (d.objectives ?? []).flatMap((o: AnyUsdm, i: number) => (o.endpoints ?? []).map((e: AnyUsdm) => ({ section: `3.${/Primary/.test(o.level?.decode) ? 1 : 2}.${i + 1}`, kind: /Primary/.test(e.level?.decode) ? 'Primary' : 'Secondary', endpoint: e.text }))),
  }
}

export function generateBuild(u: Usdm | AnyUsdm): { build: StudyBuild; notes: string[]; logForms: string[]; def?: ProtocolDef } {
  const v = u.study?.versions?.[0], d = v?.studyDesigns?.[0], tl = d?.scheduleTimelines?.find((t: AnyUsdm) => t.mainTimeline) ?? d?.scheduleTimelines?.[0]
  if (!v || !d || !tl) throw new Error('The file has no study version, study design or schedule timeline.')
  const id = v.studyIdentifiers?.[0]?.text
  if (!id) throw new Error('The file has no study identifier.')
  const isHlv = id === PROTOCOL_ID
  const notes: string[] = []
  if (!isHlv) notes.push(`Protocol ${id}: forms are mapped from each activity's biomedical concept; the build review checks the build against this protocol.`)
  const b: StudyBuild = { format: BUILD_FORMAT, version: 1, study: { protocol: id, title: v.titles?.[0]?.text ?? '', buildVersion: '0.1', source: 'EDC Study Build Lab (generated from USDM)' }, visits: [], forms: {}, codelists: { NY: structuredClone(LIBRARY_CODELISTS.NY) }, checks: [], ccg: { general: [...CCG_GENERAL], forms: {}, fields: {} } }
  // Visits: one per encounter; the window from the timing relative to Day 1.
  for (const e of d.encounters) {
    const si = tl.instances.find((x: AnyUsdm) => x.encounterId === e.id)
    const t = tl.timings.find((x: AnyUsdm) => x.relativeFromScheduledInstanceId === si?.id)
    // The generator reads every timing value as days after the anchor (it does not check the
    // timing type), which is what goes wrong for a visit timed "Before" Day 1.
    const nominal = t ? 1 + days(t.value) : 1
    b.visits.push({ id: e.name, name: e.label, day: nominal, lo: t ? nominal - days(t.windowLower) : nominal, hi: t ? nominal + days(t.windowUpper) : nominal, forms: ['SV'] })
  }
  notes.push(`Created ${b.visits.length} visits from the encounters, each with a Visit (SV) form; windows from the timings relative to Day 1.`)
  const lib = (fid: string) => { if (!b.forms[fid] && LIBRARY[fid]) { b.forms[fid] = structuredClone(LIBRARY[fid]); for (const f of LIBRARY[fid].fields) if (f.codelist && !b.codelists[f.codelist] && LIBRARY_CODELISTS[f.codelist]) b.codelists[f.codelist] = structuredClone(LIBRARY_CODELISTS[f.codelist]) } }
  if (LIBRARY.SV) lib('SV')
  // Forms: from each activity's biomedical concept.
  const unmapped: string[] = []
  for (const a of d.activities) {
    const c = conceptOf(v, a)
    const pid = String(a.id).replace('Activity_', '')
    let fid = formFor(isHlv, pid, c.name)
    if (!fid) {
      // No form in the library for this concept: a generic form from the concept's properties.
      fid = `F${pid.replace(/^P/, '')}`
      if (!b.forms[fid]) b.forms[fid] = { id: fid, name: c.name ?? a.name, domain: 'XX', fields: c.fields.map((f) => ({ id: f, label: f, type: 'text' as const })) }
      unmapped.push(`${a.name}: no CDASH form for the concept "${c.name}", so a generic form ${fid} was made with text fields (${c.fields.join(', ')}). Check the form, its domain, field types and codelists.`)
    } else lib(fid)
    for (const si of tl.instances.filter((x: AnyUsdm) => x.activityIds.includes(a.id))) {
      const vis = b.visits.find((x) => `SAI_${x.id}` === si.id)
      if (vis && !vis.forms.includes(fid)) vis.forms.push(fid)
    }
    if (a.notes?.length) notes.push(`${a.name}: the note "${a.notes[0].text}" is free text; it was not turned into fields or completion guidelines.`)
  }
  notes.push(...unmapped)
  notes.push('Adverse events and concomitant medications are scheduled at every visit in the timeline, so the generator placed the AE and CM forms on those visits rather than making them log forms.')
  // Eligibility: the criteria list from the eligibility criteria.
  const crit = d.eligibilityCriteria.map((c: AnyUsdm) => ({ value: c.identifier, label: `${c.identifier} ${v.eligibilityCriterionItems.find((i: AnyUsdm) => i.id === c.criterionItemId)?.text ?? ''}`.trim() }))
  if (b.forms.IE) { const f = b.forms.IE.fields.find((x) => x.id === 'IETESTCD'); if (f) { f.codelist = 'IETEST'; b.codelists.IETEST = crit } }
  notes.push(`Built the IETEST codelist from the ${crit.length} eligibility criteria.`)
  // Checks: a missing-value check for every required field; nothing else is generated.
  const tmp: LabProject = createProject('blank'); tmp.build = b
  if (!isHlv) tmp.imported = protocolFromUsdm(u)
  for (const f of Object.values(b.forms)) for (const fld of f.fields.filter((x) => x.required && !x.derived)) b.checks.push(missingCheck(tmp, f.id, fld.id))
  notes.push(`Generated ${b.checks.length} missing-value checks. Range, date, cross-form and protocol checks are not generated: program them from the protocol.`)
  notes.push('Not generated: an unscheduled visit (none in the schedule of activities), the protocol deviations form (section 11.10, not in the schedule), form-level completion guidelines.')
  return { build: b, notes, logForms: [], def: isHlv ? undefined : tmp.imported }
}

export function createFromUsdm(u: Usdm | AnyUsdm = usdmOf(), name = 'VASCLEAR-2 build (generated from the USDM protocol)'): LabProject {
  const p = createProject('blank', { name })
  const g = generateBuild(u)
  p.start = 'usdm'; p.build = g.build; p.logForms = g.logForms; p.automation = g.notes
  if (g.def) p.imported = g.def
  p.history.push({ utc: new Date().toISOString(), what: `First-pass build generated from the USDM protocol${g.def ? ` ${g.def.id}` : ''}`, by: 'Build generator', build: true })
  return p
}
