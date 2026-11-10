import { useState } from 'react'
import { useStore } from '../state'
import { setTeam, buildersOf, ROLE_LABEL, type Member, type Role } from '../domain/lab'
import { Btn, Modal, Select, Table, ic } from './ui'

// The study team: who builds, who tests, who releases. Names are the signatures on UAT and release.
export default function Team({ onClose }: { onClose: () => void }) {
  const { p, act } = useStore()
  const [rows, setRows] = useState<Member[]>(p!.team.map((m) => ({ ...m })))
  const builders = buildersOf(p!)
  return (
    <Modal title="Study team" onClose={onClose} wide>
      <p className="text-xs text-lab-text-muted">In practice the person who tests and approves a build is not the person who programmed it, and the release is approved by the lead data manager. Switch roles in the header to do each part yourself; the lab checks that the UAT signature comes from someone who did not change this version of the build.</p>
      <Table head={['Name', 'Role', 'Changed this build version', '']} rows={rows.map((m, i) => [
        <input aria-label={`Member ${i + 1} name`} className={ic('w-48')} value={m.name} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />,
        <Select aria-label={`Member ${i + 1} role`} className="w-44" value={m.role} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, role: e.target.value as Role } : r)))} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />,
        builders.includes(m.name) ? 'Yes' : 'No',
        <Btn tone="grey" disabled={rows.length <= 3} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Btn>,
      ])} />
      <div className="flex flex-wrap gap-2">
        <Btn tone="grey" onClick={() => setRows([...rows, { name: '', role: 'tester' }])}>Add a member</Btn>
        <Btn tone="solid" onClick={() => { if (act((x) => setTeam(x, rows))) onClose() }}>Save team</Btn>
      </div>
      {builders.length > 0 && <p className="text-xs text-lab-text-muted">Changed this version: {builders.join(', ')}. None of them can sign its UAT.</p>}
    </Modal>
  )
}
