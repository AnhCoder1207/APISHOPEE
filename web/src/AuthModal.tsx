import { useEffect, useState, type FormEvent } from 'react'
import { Brand, Modal } from './components'
import { api, ApiError } from './lib'

export function AuthModal({ open, initialMode, onClose, onAuthenticated, onToast, setLoading }: { open: boolean; initialMode: 'login' | 'register'; onClose: () => void; onAuthenticated: () => Promise<void>; onToast: (message: string, type?: 'success' | 'error') => void; setLoading: (active: boolean, message?: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setMode(initialMode)
  }, [initialMode, open])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    setBusy(true)
    setLoading(true, mode === 'login' ? 'Đang đăng nhập...' : 'Đang tạo workspace...')
    try {
      await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(data) })
      onClose()
      await onAuthenticated()
      onToast(mode === 'login' ? 'Đăng nhập thành công' : 'Tài khoản đã sẵn sàng. Hãy kết nối Shopee.')
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Không thể hoàn tất yêu cầu', 'error')
    } finally {
      setBusy(false)
      setLoading(false)
    }
  }

  return <Modal open={open} onClose={onClose}>
    <div className="auth-modal-brand"><Brand inverse={false} /></div>
    <div className="auth-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Đăng nhập</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Tạo tài khoản</button></div>
    {mode === 'login' ? <form className="modal-form" onSubmit={submit}><h2>Chào mừng trở lại</h2><p>Tiếp tục quản lý link và báo cáo của bạn.</p><label>Email<input type="email" name="email" autoComplete="email" required /></label><label>Mật khẩu<input type="password" name="password" autoComplete="current-password" required /></label><button className="button button-primary button-block" type="submit" disabled={busy}>Đăng nhập</button></form> : <form className="modal-form" onSubmit={submit}><h2>Tạo workspace mới</h2><p>Không cần thẻ thanh toán để bắt đầu.</p><label>Tên hiển thị<input name="name" autoComplete="name" minLength={2} required /></label><label>Email<input type="email" name="email" autoComplete="email" required /></label><label>Mật khẩu<input type="password" name="password" autoComplete="new-password" minLength={10} required /><small>Tối thiểu 10 ký tự.</small></label><button className="button button-primary button-block" type="submit" disabled={busy}>Tạo tài khoản</button></form>}
  </Modal>
}
