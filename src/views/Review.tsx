import { useState } from 'react'
import { useStore } from '../state'
import { useNav, type View } from '../App'
import { review, AREA_LABEL, type Area } from '../domain/review'
import { Btn, Panel, Pill, Stat, Table } from './ui'

const GO: Record<Area, View> = { protocol: 'schedule', cdash: 'forms', checks: 'checks', console: 'forms', ccg: 'forms' }

// The build against the protocol, CDASH conventions, the needed checks and the console's importer.
export default function Review() {
  const { p } = useStore()
  const { go } = useNav()
  const r = review(p!)
  const [area, setArea] = useState<Area | ''>('')
  const shown = r.all.filter((f) => !area || f.area === area).sort((a, b) => ['High', 'Medium', 'Low'].indexOf(a.sev) - ['High', 'Medium', 'Low'].indexOf(b.sev))
  return (
    <div className="space-y-4">
      <Panel title="Build review" sub="High findings block release: the build would not collect what the protocol needs, or the console would refuse the file. Medium findings need a fix or a reason. Low findings are improvements.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="High" value={r.high} tone={r.high ? 'red' : 'green'} /><Stat label="Medium" value={r.medium} tone={r.medium ? 'amber' : 'green'} /><Stat label="Low" value={r.low} /><Stat label="Review score" value={`${r.score}%`} tone={r.score >= 90 ? 'green' : 'amber'} />
        </div>
        <div className="flex flex-wrap gap-1">
          <Btn tone={area === '' ? 'solid' : 'grey'} onClick={() => setArea('')}>All ({r.all.length})</Btn>
          {(Object.keys(AREA_LABEL) as Area[]).map((a) => <Btn key={a} tone={area === a ? 'solid' : 'grey'} onClick={() => setArea(a)}>{AREA_LABEL[a]} ({r.all.filter((f) => f.area === a).length})</Btn>)}
        </div>
      </Panel>
      <Table head={['Severity', 'Area', 'Where', 'Finding', 'Fix', 'Source', '']} empty="No findings in this area."
        rows={shown.map((f) => [<Pill tone={f.sev === 'High' ? 'red' : f.sev === 'Medium' ? 'amber' : 'grey'}>{f.sev}</Pill>, AREA_LABEL[f.area], f.where, f.text, <span className="text-lab-text-muted">{f.fix}</span>, <span className="whitespace-nowrap">{f.ref}</span>, <Btn tone="grey" onClick={() => go(GO[f.area])}>Go</Btn>])} />
    </div>
  )
}
