import { createContext, useContext, useState } from 'react'
import { StoreProvider, useStore } from './state'
import { review } from './domain/review'
import { uatState } from './domain/lab'
import { Btn, Pill } from './views/ui'
import Home from './views/Home'
import Protocol from './views/Protocol'
import Schedule from './views/Schedule'
import Forms from './views/Forms'
import Codelists from './views/Codelists'
import Checks from './views/Checks'
import Review from './views/Review'
import Uat from './views/Uat'
import Release from './views/Release'
import Learn from './views/Learn'
import { MissionBar } from './views/Missions'

export type View = 'protocol' | 'schedule' | 'forms' | 'codelists' | 'checks' | 'review' | 'uat' | 'release'
interface Nav { view: View; arg?: string; go: (v: View, arg?: string) => void }
const NavCtx = createContext<Nav>({ view: 'protocol', go: () => {} })
export const useNav = () => useContext(NavCtx)

const VIEWS: { id: View; label: string; step: string }[] = [
  { id: 'protocol', label: 'Protocol', step: '1' }, { id: 'schedule', label: 'Schedule', step: '2' }, { id: 'forms', label: 'Forms', step: '3' }, { id: 'codelists', label: 'Codelists', step: '4' },
  { id: 'checks', label: 'Edit checks', step: '5' }, { id: 'review', label: 'Build review', step: '6' }, { id: 'uat', label: 'UAT', step: '7' }, { id: 'release', label: 'Release', step: '8' },
]

function Shell() {
  const { p, close, error, setError, saved } = useStore()
  const [nav, setNav] = useState<{ view: View; arg?: string }>({ view: 'protocol' })
  const [page, setPage] = useState<'home' | 'learn'>(() => (location.hash === '#/learn' ? 'learn' : 'home'))
  const go = (view: View, arg?: string) => { setNav({ view, arg }); window.scrollTo({ top: 0 }) }
  const r = p ? review(p) : null
  const u = p ? uatState(p) : null
  const V = { protocol: Protocol, schedule: Schedule, forms: Forms, codelists: Codelists, checks: Checks, review: Review, uat: Uat, release: Release }[nav.view]
  return (
    <NavCtx.Provider value={{ ...nav, go }}>
      <div className="min-h-screen bg-lab-bg text-lab-text flex flex-col">
        <header className="border-b border-lab-line bg-lab-panel/90 sticky top-0 z-40 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="mr-auto">
              <button className="font-mono text-sm text-lab-fda text-left" onClick={() => { close(); setPage('home') }}>EDC Study Build Lab</button>
              <p className="text-[11px] text-lab-text-muted">{p ? `${p.name} · ${p.build.study.protocol} · build ${p.build.study.buildVersion}` : 'From an ICH M11 protocol to a released study build · training only'}</p>
            </div>
            {p && r && u && (
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={r.high ? 'red' : r.medium ? 'amber' : 'green'}>Review: {r.high} high, {r.medium} medium</Pill>
                <Pill tone={p.uat.signed ? 'green' : u.failed ? 'red' : 'grey'}>{p.uat.signed ? 'UAT signed' : u.runs ? `UAT: ${u.failed} failed` : 'UAT not run'}</Pill>
                {p.releases.length > 0 && <Pill tone="blue">Released {p.releases.at(-1)!.version}</Pill>}
                <Btn tone="grey" onClick={() => { close(); setPage('home') }}>All builds</Btn>
              </div>
            )}
            {!p && (
              <nav className="flex gap-1" aria-label="Main">
                {(['home', 'learn'] as const).map((x) => <button key={x} onClick={() => setPage(x)} aria-current={page === x ? 'page' : undefined} className={`px-3 py-1.5 font-mono text-xs border-b-2 ${page === x ? 'border-lab-fda text-lab-fda' : 'border-transparent text-lab-text-muted hover:text-lab-text'}`}>{x === 'home' ? 'Builds and missions' : 'Learn'}</button>)}
              </nav>
            )}
          </div>
          {p && (
            <nav className="max-w-7xl mx-auto px-4 flex flex-wrap gap-1" aria-label="Build steps">
              {VIEWS.map((v) => (
                <button key={v.id} onClick={() => go(v.id)} aria-current={nav.view === v.id ? 'page' : undefined}
                  className={`px-3 py-1.5 font-mono text-xs border-b-2 ${nav.view === v.id ? 'border-lab-fda text-lab-fda' : 'border-transparent text-lab-text-muted hover:text-lab-text'}`}>
                  <span className="text-lab-text-muted mr-1">{v.step}</span>{v.label}
                </button>
              ))}
            </nav>
          )}
        </header>
        {error && <div role="alert" className="max-w-7xl mx-auto w-full px-4 pt-3"><div className="rounded border border-lab-red/60 bg-lab-red-soft px-3 py-2 text-sm text-lab-red flex justify-between gap-2"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss">✕</button></div></div>}
        <main className="max-w-7xl mx-auto w-full px-4 py-4 flex-1">
          {p ? <><MissionBar /><V /></> : page === 'learn' ? <Learn /> : <Home onOpen={() => go('protocol')} />}
        </main>
        <footer className="border-t border-lab-line text-[11px] text-lab-text-muted">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between gap-2">
            <span>Built by Khan Gulrez Shagufa Fazal Ahmed · Apache-2.0</span>
            <span>Training only. Fictional protocol, sponsor and product; not a validated system. Saved in this browser{saved ? ` · saved ${saved}` : ''}.</span>
          </div>
        </footer>
      </div>
    </NavCtx.Provider>
  )
}

export default function App() { return <StoreProvider><Shell /></StoreProvider> }
