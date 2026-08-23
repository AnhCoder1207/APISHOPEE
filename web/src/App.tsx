import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthModal } from './AuthModal'
import { IconSprite } from './components'
import { Landing } from './Landing'
import { api, ApiError } from './lib'
import type { Bootstrap, View } from './types'
import { Workspace } from './Workspace'
import './styles.css'

interface ToastItem { id: number; message: string; type: 'success' | 'error' }

export default function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) || 'dashboard')
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const [loading, setLoadingState] = useState(false)
  const [loadingCopy, setLoadingCopy] = useState('Đang xử lý...')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const initialized = useRef(false)

  const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])

  const setLoading = useCallback((active: boolean, message = 'Đang xử lý...') => {
    setLoadingCopy(message)
    setLoadingState(active)
  }, [])

  const refreshBootstrap = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true, 'Đang tải workspace...')
    try {
      setBootstrap(await api<Bootstrap>('/api/app/bootstrap'))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [setLoading])

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* The session may already be expired. */ }
    setBootstrap(null)
    history.replaceState(null, '', location.pathname)
  }, [])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const initialize = async () => {
      try {
        await api('/api/auth/me')
        await refreshBootstrap()
      } catch (error) {
        setLoading(false)
        if (error instanceof ApiError && error.status && error.status !== 401) toast(error.message, 'error')
      }
    }
    void initialize()
  }, [refreshBootstrap, setLoading, toast])

  useEffect(() => {
    const onHash = () => {
      const next = location.hash.slice(1) as View
      if (['dashboard', 'convert', 'reports', 'connections', 'api-keys', 'admin'].includes(next)) setView(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (next: View) => {
    setView(next)
    history.replaceState(null, '', `#${next}`)
  }

  return <>
    <IconSprite />
    {bootstrap ? <Workspace bootstrap={bootstrap} view={bootstrap.user.isAdmin || view !== 'admin' ? view : 'dashboard'} onView={navigate} onLogout={logout} onRefresh={refreshBootstrap} onToast={toast} setLoading={setLoading} /> : <Landing onAuth={setAuthMode} />}
    <AuthModal open={Boolean(authMode)} initialMode={authMode || 'login'} onClose={() => setAuthMode(null)} onAuthenticated={() => refreshBootstrap(true)} onToast={toast} setLoading={setLoading} />
    <div className="toast-region" aria-live="polite">{toasts.map((item) => <div className={`toast ${item.type}`} key={item.id}>{item.message}</div>)}</div>
    {loading && <div className="loading-overlay"><span className="loader" /><p>{loadingCopy}</p></div>}
  </>
}
