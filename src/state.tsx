import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { LabProject } from './domain/lab'
import { listProjects, saveProject, deleteProject } from './domain/store'

interface Store {
  p: LabProject | null; projects: LabProject[]; tick: number
  act: (fn: (p: LabProject) => void) => boolean
  open: (p: LabProject) => void; close: () => void; remove: (id: string) => Promise<void>
  error: string; setError: (s: string) => void; saved: string
}
const Ctx = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx)!

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<LabProject | null>(null)
  const [projects, setProjects] = useState<LabProject[]>([])
  const [tick, setTick] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const refresh = useCallback(() => listProjects().then((all) => setProjects(all.sort((a, b) => b.updatedUtc.localeCompare(a.updatedUtc)))).catch(() => {}), [])
  useEffect(() => { refresh().finally(() => setReady(true)) }, [refresh])

  const persist = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (!ref.current) return
      saveProject(ref.current).then(() => { setSaved(new Date().toLocaleTimeString()); refresh() }).catch((e) => setError(`Could not save to this browser: ${(e as Error).message}`))
    }, 400)
  }, [refresh])
  const act = useCallback((fn: (p: LabProject) => void) => {
    if (!ref.current) return false
    try { fn(ref.current); setError(''); return true } catch (e) { setError((e as Error).message); return false } finally { setTick((t) => t + 1); persist() }
  }, [persist])
  const open = useCallback((np: LabProject) => { ref.current = np; setTick((t) => t + 1); persist() }, [persist])
  const close = useCallback(() => { ref.current = null; setTick((t) => t + 1); refresh() }, [refresh])
  const remove = useCallback(async (id: string) => { await deleteProject(id); if (ref.current?.id === id) ref.current = null; await refresh(); setTick((t) => t + 1) }, [refresh])

  if (!ready) return <div className="min-h-screen bg-lab-bg text-lab-text-muted grid place-items-center font-mono text-sm">Loading…</div>
  return <Ctx.Provider value={{ p: ref.current, projects, tick, act, open, close, remove, error, setError, saved }}>{children}</Ctx.Provider>
}
