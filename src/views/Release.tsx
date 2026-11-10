import { useState } from 'react'
import { useStore } from '../state'
import { release, exportBuild, buildHash } from '../domain/lab'
import { review } from '../domain/review'
import { annotatedCrf, dvsCsv, ccgHtml } from '../domain/docs'
import { download } from '../domain/store'
import { Btn, Panel, Pill, SignForm, Table, TextArea, fmtUtc, ic } from './ui'

const CONSOLE = 'https://randomthingsonlineatsk-cloud.github.io/cdm-query-console/'

// Release: version the build, sign, and hand it to the CDM console with its documents.
export default function Release() {
  const { p, act } = useStore()
  const r = review(p!)
  const signedNow = !!p!.uat.signed && p!.uat.buildHash === buildHash(p!.build)
  const last = p!.releases.at(-1)
  const [version, setVersion] = useState(last ? `${last.version.split('.')[0]}.${Number(last.version.split('.')[1]) + 1}` : '1.0')
  const [notes, setNotes] = useState('')
  const proto = p!.build.study.protocol
  const dlBuild = () => download(`${proto}-study-build-${p!.build.study.buildVersion}.json`, JSON.stringify(exportBuild(p!), null, 2))
  return (
    <div className="space-y-4">
      <Panel title="Release the build" sub="A release needs a clean build review (no High findings) and a UAT sign-off on this exact build. The released file is what the CDM console imports.">
        <ul className="text-xs space-y-1">
          <li>{r.high === 0 ? <Pill tone="green">Done</Pill> : <Pill tone="red">{r.high} High</Pill>} Build review has no High findings</li>
          <li>{signedNow ? <Pill tone="green">Done</Pill> : <Pill tone="red">Open</Pill>} UAT signed on this build</li>
        </ul>
        <div className="grid sm:grid-cols-[10rem_1fr] gap-2">
          <label className="text-xs text-lab-text-muted">Version<input className={ic('')} value={version} onChange={(e) => setVersion(e.target.value)} /></label>
          <label className="text-xs text-lab-text-muted">Release notes<TextArea className="min-h-12" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed since the last release, and why." /></label>
        </div>
        <SignForm meaning="I release this build for production use." label="Release" disabled={r.high > 0 || !signedNow || !notes.trim()} onSign={(s) => act((x) => release(x, version, notes, s))} />
      </Panel>

      <Panel title="Files" sub="The study build file goes to the CDM console (Project, Import a study build). The documents go to the trial master file.">
        <div className="flex flex-wrap gap-2">
          <Btn tone="solid" onClick={dlBuild}>Study build file (JSON)</Btn>
          <Btn tone="grey" onClick={() => download(`${proto}-annotated-crf.html`, annotatedCrf(p!), 'text/html')}>Annotated CRF (HTML)</Btn>
          <Btn tone="grey" onClick={() => download(`${proto}-data-validation-specification.csv`, dvsCsv(p!), 'text/csv')}>Data validation specification (CSV)</Btn>
          <Btn tone="grey" onClick={() => download(`${proto}-crf-completion-guidelines.html`, ccgHtml(p!), 'text/html')}>CRF completion guidelines (HTML)</Btn>
        </div>
        <p className="text-xs text-lab-text-muted">Then open the <a className="text-lab-fda underline" href={CONSOLE} target="_blank" rel="noreferrer">CDM Query &amp; Edit-Check Console</a>, go to Project and import the study build file: the console shows what the build changes and puts it in force for a new or existing HLV-204-201 project. {last ? '' : 'You can download an unreleased build to try it, but only a released build should go to production.'}</p>
      </Panel>

      <Panel title="Release history">
        <Table head={['Version', 'Released', 'By', 'Build hash', 'Notes']} empty="No releases yet." rows={p!.releases.map((x) => [x.version, `${fmtUtc(x.utc)} UTC`, `${x.signed.name} (${x.signed.role})`, <span className="font-mono">{x.hash}</span>, x.notes])} />
      </Panel>
      <Panel title="Build history">
        <Table head={['When (UTC)', 'What']} rows={[...p!.history].reverse().slice(0, 60).map((h) => [fmtUtc(h.utc), h.what])} />
      </Panel>
    </div>
  )
}
