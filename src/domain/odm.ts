// The study build as CDISC ODM v2.0 study metadata (namespace http://www.cdisc.org/ns/odm/v2.0).
// ODM is the vendor-neutral format EDC systems use to exchange study designs. Mapping:
//   visit        -> StudyEventDef (Type Scheduled, or Unscheduled for UNS); log forms sit in a
//                   "Log forms" StudyEventDef (Repeating, Type Common)
//   form         -> ItemGroupDef Type="Form"; each field -> ItemDef with Question, unit as Prompt, completion
//                   instructions, CDASH and SDTM Alias and a CodeListRef
//   codelist     -> CodeList with CodeListItem and Decode
//   show-if      -> ConditionDef used as the ItemRef's CollectionExceptionCondition (the item is
//                   not collected when the condition is true)
//   edit check   -> RangeCheck on the target ItemDef: a soft check whose FormalExpression must be
//                   true for the value to be accepted (so it is the check's logic negated), with
//                   the query text as ErrorMessage. The expression is in this lab's check
//                   language, named in the Context attribute; ODM does not fix one language.
// Validated in the tests against the official ODM v2.0 schema (cdisc-org/DataExchange-ODM).
import type { LabProject } from './lab'
import { sdtmOf } from './docs'

const x = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))
const oid = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_')
const tt = (s: string) => `<TranslatedText xml:lang="en" Type="text/plain">${x(s)}</TranslatedText>`
const DT: Record<string, string> = { text: 'text', number: 'float', date: 'date', select: 'text', yn: 'text' }
export const CHECK_LANGUAGE = 'EDC Study Build Lab check language 1'

export function odmXml(p: LabProject, created = new Date().toISOString().slice(0, 19)): string {
  const b = p.build, sid = `ST.${oid(b.study.protocol)}`, mdv = `MDV.${oid(b.study.buildVersion)}`
  const used = new Set<string>()
  const conds: string[] = []
  const events = b.visits.map((v, i) => {
    const refs = v.forms.filter((f) => b.forms[f]).map((f, j) => `<ItemGroupRef ItemGroupOID="IG.${oid(f)}" Mandatory="${f === 'SV' ? 'Yes' : 'No'}" OrderNumber="${j + 1}"/>`).join('')
    return { ref: `<StudyEventGroupRef StudyEventGroupOID="SEG.${oid(v.id)}" Mandatory="${v.id === 'UNS' ? 'No' : 'Yes'}" OrderNumber="${i + 1}"/>`, def: `<StudyEventDef OID="SE.${oid(v.id)}" Name="${x(v.name)}" Repeating="${v.id === 'UNS' ? 'Yes' : 'No'}" Type="${v.id === 'UNS' ? 'Unscheduled' : 'Scheduled'}"><Description>${tt(`${v.name}: study day ${v.day}, window ${v.lo} to ${v.hi}`)}</Description>${refs}</StudyEventDef>`, group: `<StudyEventGroupDef OID="SEG.${oid(v.id)}" Name="${x(v.name)}"><StudyEventRef StudyEventOID="SE.${oid(v.id)}" Mandatory="${v.id === 'UNS' ? 'No' : 'Yes'}"/></StudyEventGroupDef>` }
  })
  if (p.logForms.length) events.push({ ref: `<StudyEventGroupRef StudyEventGroupOID="SEG.LOG" Mandatory="No" OrderNumber="${events.length + 1}"/>`, def: `<StudyEventDef OID="SE.LOG" Name="Log forms" Repeating="No" Type="Common"><Description>${tt('Subject-level forms collected at any time: ' + p.logForms.join(', '))}</Description>${p.logForms.filter((f) => b.forms[f]).map((f, j) => `<ItemGroupRef ItemGroupOID="IG.${oid(f)}" Mandatory="No" OrderNumber="${j + 1}"/>`).join('')}</StudyEventDef>`, group: `<StudyEventGroupDef OID="SEG.LOG" Name="Log forms"><StudyEventRef StudyEventOID="SE.LOG" Mandatory="No"/></StudyEventGroupDef>` })
  const groups = Object.values(b.forms).map((f) => {
    const refs = f.fields.map((fld, i) => {
      let c = ''
      if (fld.showIf) {
        const cid = `COND.${oid(f.id)}.${oid(fld.id)}`
        const e = fld.showIf.field === '__visit' ? `vis() != '${fld.showIf.equals}'` : `${fld.showIf.field} != '${fld.showIf.equals}'`
        const nm = `${f.id}.${fld.id} not collected unless ${fld.showIf.field === '__visit' ? 'visit' : fld.showIf.field} = ${fld.showIf.equals}`
        conds.push(`<ConditionDef OID="${cid}" Name="${x(nm)}"><Description>${tt(nm)}</Description><MethodSignature><ReturnValue Name="notCollected" DataType="boolean"/></MethodSignature><FormalExpression Context="${CHECK_LANGUAGE}"><Code>${x(e)}</Code></FormalExpression></ConditionDef>`)
        c = ` CollectionExceptionConditionOID="${cid}"`
      }
      return `<ItemRef ItemOID="IT.${oid(f.id)}.${oid(fld.id)}" Mandatory="${fld.required ? 'Yes' : 'No'}" OrderNumber="${i + 1}"${c}${fld.derived ? ' MethodOID="MT.DERIVED"' : ''}/>`
    }).join('')
    return `<ItemGroupDef OID="IG.${oid(f.id)}" Name="${x(f.name)}" Repeating="${f.repeating ? 'Simple' : 'No'}" Type="Form" Domain="${x(f.domain)}"><Description>${tt(f.name)}</Description>${refs}<Alias Context="SDTM" Name="${x(f.domain)}"/></ItemGroupDef>`
  })
  const items = Object.values(b.forms).flatMap((f) => f.fields.map((fld) => {
    if (fld.codelist && b.codelists[fld.codelist]) used.add(fld.codelist)
    const checks = b.checks.filter((c) => c.active && c.form === f.id && c.field === fld.id).map((c) => `<RangeCheck SoftHard="Soft"><FormalExpression Context="${CHECK_LANGUAGE}"><Code>${x(`not (${c.expr})`)}</Code></FormalExpression><ErrorMessage>${tt(`[${c.id}] ${c.message}`)}</ErrorMessage></RangeCheck>`).join('')
    return `<ItemDef OID="IT.${oid(f.id)}.${oid(fld.id)}" Name="${x(fld.id)}" DataType="${fld.type === 'yn' || fld.type === 'select' ? 'text' : DT[fld.type] ?? 'text'}"${fld.type === 'text' || fld.type === 'select' || fld.type === 'yn' ? ' Length="200"' : ''}><Question>${tt(fld.label)}</Question>${fld.unit ? `<Prompt>${tt(fld.unit)}</Prompt>` : ''}${b.ccg.fields?.[`${f.id}.${fld.id}`] ? `<CRFCompletionInstructions>${tt(b.ccg.fields[`${f.id}.${fld.id}`])}</CRFCompletionInstructions>` : ''}${checks}${fld.codelist && b.codelists[fld.codelist] ? `<CodeListRef CodeListOID="CL.${oid(fld.codelist)}"/>` : ''}<Alias Context="CDASH" Name="${x(fld.id)}"/><Alias Context="SDTM" Name="${x(sdtmOf(b, f.id, fld.id))}"/></ItemDef>`
  }))
  const lists = [...used].map((id) => `<CodeList OID="CL.${oid(id)}" Name="${x(id)}" DataType="text">${b.codelists[id].map((c, i) => `<CodeListItem CodedValue="${x(c.value)}" OrderNumber="${i + 1}"><Decode>${tt(c.label)}</Decode></CodeListItem>`).join('')}</CodeList>`)
  const anyDerived = Object.values(b.forms).some((f) => f.fields.some((fld) => fld.derived))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Training material: fictional protocol ${x(b.study.protocol)}. Exported by the EDC Study Build Lab. -->
<ODM xmlns="http://www.cdisc.org/ns/odm/v2.0" ODMVersion="2.0" FileType="Snapshot" FileOID="edc-study-build-lab/${oid(b.study.protocol)}/${oid(b.study.buildVersion)}" CreationDateTime="${created}" Granularity="Metadata" SourceSystem="EDC Study Build Lab" SourceSystemVersion="1">
<Study OID="${sid}" StudyName="${x(b.study.protocol)}" ProtocolName="${x(b.study.protocol)}">
<Description>${tt(b.study.title)}</Description>
<MetaDataVersion OID="${mdv}" Name="Build ${x(b.study.buildVersion)}">
<Description>${tt(`Study build ${b.study.buildVersion}, ${b.visits.length} visits, ${Object.keys(b.forms).length} forms, ${b.checks.filter((c) => c.active).length} active edit checks`)}</Description>
<Protocol>${events.map((e) => e.ref).join('')}</Protocol>
${events.map((e) => e.group).join('\n')}
${events.map((e) => e.def).join('\n')}
${groups.join('\n')}
${items.join('\n')}
${lists.join('\n')}
${conds.join('\n')}
${anyDerived ? `<MethodDef OID="MT.DERIVED" Name="Derived by the system" Type="Computation"><Description>${tt('Calculated by the EDC system; see the data validation specification.')}</Description><MethodSignature><ReturnValue Name="value" DataType="float"/></MethodSignature></MethodDef>` : ''}
</MetaDataVersion>
</Study>
</ODM>
`
}
