// The ODM export against the official CDISC ODM v2.0 schema (tests/odm-v2.0-schema), with xmllint.
import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProject, referenceBuild, importBuild } from '../src/domain/lab'
import { odmXml } from '../src/domain/odm'
import { createFromUsdm } from '../src/domain/usdm'

const here = dirname(fileURLToPath(import.meta.url))
function validate(xml) {
  const f = join(mkdtempSync(join(tmpdir(), 'odm-')), 'build.xml'); writeFileSync(f, xml)
  try { execFileSync('xmllint', ['--noout', '--schema', join(here, 'odm-v2.0-schema', 'ODM.xsd'), f], { stdio: ['ignore', 'pipe', 'pipe'] }); return 'valid' }
  catch (e) { if (e.code === 'ENOENT') return 'no xmllint'; return String(e.stderr) }
}
test('reference, draft and generated builds validate against the ODM v2.0 schema', () => {
  const ref = createProject('draft'); importBuild(ref, JSON.stringify(referenceBuild()))
  for (const p of [ref, createProject('draft'), createFromUsdm()]) {
    const r = validate(odmXml(p, '2026-11-10T10:00:00'))
    if (r === 'no xmllint') return
    expect(r).toBe('valid')
  }
})
