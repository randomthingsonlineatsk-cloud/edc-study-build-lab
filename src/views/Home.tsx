import { useRef, useState } from 'react'
import { useStore } from '../state'
import { createProject, importBuild, type StartKind, type LabProject } from '../domain/lab'
import { createFromUsdm, usdmOf, type Usdm } from '../domain/usdm'
import { createAmendProject } from '../domain/amendment'
import { download } from '../domain/store'
import { review } from '../domain/review'
import { M11 } from '../domain/m11'
import { Btn, Panel, Pill, Table, fmtUtc } from './ui'
import Missions from './Missions'

const STARTS: { id: StartKind; title: string; text: string }[] = [
  { id: 'library', title: 'Build from the protocol, with the form library', text: 'An empty build. Create the visits from the schedule of activities, add CDASH forms from the library, adjust fields and codelists, then program the edit checks.' },
  { id: 'blank', title: 'Build from the protocol, from scratch', text: 'An empty build without the library shortcut on the Forms page: design each form and field yourself.' },
  { id: 'draft', title: 'Review and fix the draft build', text: 'The build the CDM console runs today, version 0.1: it has gaps against the protocol and three programming errors in its edit checks. Find and fix them, run UAT and release version 1.0.' },
  { id: 'usdm', title: 'Generate from the digital protocol (USDM)', text: 'The protocol held as CDISC USDM data drives an automated first-pass build. Read the automation report, find what the generator got wrong or left out, and finish the build.' },
  { id: 'amend', title: 'Amend a build in production', text: 'Build 1.0 is live with data entered. Amendment 3 adds a visit, a laboratory test and a new safety threshold: assess the impact, build 1.1, re-test what changed and release.' },
]
const make = (k: StartKind): LabProject => (k === 'usdm' ? createFromUsdm() : k === 'amend' ? createAmendProject() : createProject(k))

export default function Home({ onOpen }: { onOpen: () => void }) {
  const { projects, open, remove, setError } = useStore()
  const [confirm, setConfirm] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const start = (k: StartKind) => { open(make(k)); onOpen() }
  const usdmFile = useRef<HTMLInputElement>(null)
  const importUsdm = async (f: File) => { try { open(createFromUsdm(JSON.parse(await f.text()) as Usdm, `Generated from ${f.name}`)); onOpen() } catch (e) { setError(`Could not generate a build from this file: ${(e as Error).message}`) } }
  const importFile = async (f: File) => {
    try { const p = createProject('blank', { name: `Imported: ${f.name}` }); importBuild(p, await f.text()); open(p); onOpen() } catch (e) { setError((e as Error).message) }
  }
  return (
    <div className="space-y-4">
      <Panel title="Build a clinical trial database from its protocol" sub={`Protocol ${M11.title['Sponsor Protocol Identifier']} (${M11.title['Trial Acronym']}), written in the ICH M11 structure. Fictional sponsor and product.`}>
        <p className="text-sm text-lab-text">An EDC study build turns the protocol into the database sites will use: the visit schedule from the schedule of activities, eCRF forms with CDASH variables, codelists from controlled terminology, edit checks with test cases, and CRF completion guidelines. It is tested in user acceptance testing (UAT), signed off and released. The release here is a study build file that the <a className="text-lab-fda underline" href="https://randomthingsonlineatsk-cloud.github.io/cdm-query-console/" target="_blank" rel="noreferrer">CDM Query &amp; Edit-Check Console</a> imports, so the same build is then used for data cleaning.</p>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
          {STARTS.map((s) => (
            <div key={s.id} className="rounded border border-lab-line bg-lab-panel-strong/50 p-3 space-y-2 flex flex-col">
              <h3 className="font-mono text-xs text-lab-text">{s.title}</h3>
              <p className="text-xs text-lab-text-muted flex-1">{s.text}</p>
              <Btn tone="solid" onClick={() => start(s.id)}>Start</Btn>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="grey" onClick={() => file.current?.click()}>Open a study build file (JSON)</Btn>
          <input ref={file} type="file" accept=".json,application/json" className="hidden" aria-label="Study build file" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
          <span className="text-xs text-lab-text-muted">A build exported from the console, or a release from this lab.</span>
          <Btn tone="grey" onClick={() => download('HLV-204-201-protocol-2.0-usdm.json', JSON.stringify(usdmOf(), null, 2))}>Download the protocol as USDM (JSON)</Btn>
          <Btn tone="grey" onClick={() => usdmFile.current?.click()}>Generate a build from a USDM file</Btn>
          <input ref={usdmFile} type="file" accept=".json,application/json" className="hidden" aria-label="USDM file" onChange={(e) => { const f = e.target.files?.[0]; if (f) importUsdm(f); e.target.value = '' }} />
        </div>
      </Panel>

      <Missions />

      <Panel title="Your builds" sub="Saved in this browser.">
        <Table head={['Build', 'Start', 'Version', 'Review', 'UAT', 'Updated', '']} empty="No builds yet: start one above."
          rows={projects.map((p) => {
            const r = review(p)
            return [
              <span className="text-lab-text">{p.name}{p.mission && <Pill tone="purple" className="ml-1">{p.mission.id}</Pill>}</span>, p.start, p.build.study.buildVersion,
              <Pill tone={r.high ? 'red' : r.medium ? 'amber' : 'green'}>{r.high}/{r.medium}</Pill>, p.uat.signed ? <Pill tone="green">Signed</Pill> : <Pill>Open</Pill>, fmtUtc(p.updatedUtc),
              <div className="flex gap-1">
                <Btn onClick={() => { open(p); onOpen() }}>Open</Btn>
                {confirm === p.id ? <Btn tone="red" onClick={() => { remove(p.id); setConfirm(null) }}>Confirm delete</Btn> : <Btn tone="grey" onClick={() => setConfirm(p.id)}>Delete</Btn>}
              </div>,
            ]
          })} />
      </Panel>
    </div>
  )
}
