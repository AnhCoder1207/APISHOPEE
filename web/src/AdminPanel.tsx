import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Modal, Pagination } from './components'
import { adminStatus, api, ApiError, formatDateTime, formatNumber } from './lib'
import type { AdminAudit, AdminOverview, AdminUser, AdminWorkspace, Connection, Paginated } from './types'

const emptyPage = <T,>(): Paginated<T> => ({ items: [], page: 1, totalPages: 1 })

export function AdminPanel({ currentUserId, onToast, setLoading }: { currentUserId: string; onToast: (message: string, type?: 'success' | 'error') => void; setLoading: (active: boolean, message?: string) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<Paginated<AdminUser>>(emptyPage)
  const [workspaces, setWorkspaces] = useState<Paginated<AdminWorkspace>>(emptyPage)
  const [connections, setConnections] = useState<Paginated<Connection>>(emptyPage)
  const [audit, setAudit] = useState<Paginated<AdminAudit>>(emptyPage)
  const [userFilter, setUserFilter] = useState({ query: '', status: 'all' })
  const [workspaceFilter, setWorkspaceFilter] = useState({ query: '', status: 'all', plan: 'all' })
  const [connectionFilter, setConnectionFilter] = useState({ query: '', status: 'all' })
  const [editingWorkspace, setEditingWorkspace] = useState<AdminWorkspace | null>(null)

  const showError = (error: unknown) => onToast(error instanceof Error ? error.message : 'Không thể tải dữ liệu quản trị', 'error')
  const loadUsers = useCallback(async (page = 1, filter = userFilter) => {
    const params = new URLSearchParams({ ...filter, page: String(page), limit: '25' })
    setUsers(await api(`/api/admin/users?${params}`))
  }, [userFilter])
  const loadWorkspaces = useCallback(async (page = 1, filter = workspaceFilter) => {
    const params = new URLSearchParams({ ...filter, page: String(page), limit: '25' })
    setWorkspaces(await api(`/api/admin/workspaces?${params}`))
  }, [workspaceFilter])
  const loadConnections = useCallback(async (page = 1, filter = connectionFilter) => {
    const params = new URLSearchParams({ ...filter, page: String(page), limit: '25' })
    setConnections(await api(`/api/admin/connections?${params}`))
  }, [connectionFilter])
  const loadAudit = useCallback(async (page = 1) => setAudit(await api(`/api/admin/audit?page=${page}&limit=25`)), [])

  const refreshAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true, 'Đang tải trung tâm quản trị...')
    try {
      const [nextOverview] = await Promise.all([api<AdminOverview>('/api/admin/bootstrap'), loadUsers(), loadWorkspaces(), loadConnections(), loadAudit()])
      setOverview(nextOverview)
    } catch (error) {
      showError(error)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [loadAudit, loadConnections, loadUsers, loadWorkspaces, setLoading])

  useEffect(() => { void refreshAll() }, [refreshAll])

  const updateUser = async (user: AdminUser, action: 'status' | 'admin' | 'sessions') => {
    let path = `/api/admin/users/${user.id}`
    let method = 'PATCH'
    let body: Record<string, unknown> | undefined
    let message = ''
    if (action === 'status') {
      const status = user.status === 'active' ? 'suspended' : 'active'
      if (!confirm(`${status === 'suspended' ? 'Khóa' : 'Mở khóa'} tài khoản ${user.email}?`)) return
      body = { status }
      message = status === 'suspended' ? 'Đã khóa tài khoản và thu hồi phiên' : 'Đã mở khóa tài khoản'
    } else if (action === 'admin') {
      const isAdmin = !user.is_admin
      if (!confirm(`${isAdmin ? 'Cấp' : 'Gỡ'} quyền system admin cho ${user.email}?`)) return
      body = { isAdmin }
      message = isAdmin ? 'Đã cấp quyền system admin' : 'Đã gỡ quyền system admin'
    } else {
      if (!confirm(`Thu hồi toàn bộ phiên đăng nhập của ${user.email}?`)) return
      path += '/revoke-sessions'
      method = 'POST'
      message = 'Đã thu hồi toàn bộ phiên đăng nhập'
    }
    setLoading(true, 'Đang cập nhật quyền truy cập...')
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined })
      await refreshAll(true)
      onToast(message)
    } catch (error) { showError(error) } finally { setLoading(false) }
  }

  const revokeWorkspaceKeys = async (workspace: AdminWorkspace) => {
    if (!confirm(`Thu hồi toàn bộ API key đang hoạt động của workspace "${workspace.name}"?`)) return
    setLoading(true, 'Đang thu hồi API key...')
    try {
      await api(`/api/admin/workspaces/${workspace.id}/revoke-api-keys`, { method: 'POST' })
      await refreshAll(true)
      onToast('Đã thu hồi toàn bộ API key của workspace')
    } catch (error) { showError(error) } finally { setLoading(false) }
  }

  const saveWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingWorkspace) return
    const form = new FormData(event.currentTarget)
    const body = { plan: form.get('plan'), status: form.get('status'), monthlyQuota: Number(form.get('monthlyQuota')) }
    if (body.status === 'suspended' && editingWorkspace.status !== 'suspended' && !confirm(`Tạm khóa workspace "${editingWorkspace.name}" và thu hồi các phiên đăng nhập?`)) return
    setLoading(true, 'Đang cập nhật workspace...')
    try {
      await api(`/api/admin/workspaces/${editingWorkspace.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setEditingWorkspace(null)
      await refreshAll(true)
      onToast('Đã cập nhật workspace')
    } catch (error) { showError(error) } finally { setLoading(false) }
  }

  const metrics = overview?.metrics || {}
  const plans = Object.fromEntries((overview?.planDistribution || []).map((item) => [item.plan, item.count]))
  const signupMax = Math.max(1, ...(overview?.signupDaily || []).map((item) => Number(item.count || 0)))
  const actionLabels: Record<string, string> = { 'user.update': 'Cập nhật người dùng', 'user.sessions.revoke': 'Thu hồi phiên', 'workspace.update': 'Cập nhật workspace', 'workspace.api_keys.revoke': 'Thu hồi API key' }

  return <section className="app-panel active admin-panel">
    <div className="admin-banner"><span><small>System console</small><h2>Trung tâm vận hành CamLink</h2><p>Quản lý truy cập, workspace, quota và sức khỏe kết nối mà không chạm vào dữ liệu bí mật của khách hàng.</p></span><button className="button admin-refresh-button" type="button" onClick={() => { void refreshAll(); onToast('Dữ liệu quản trị đã được làm mới') }}>Làm mới dữ liệu</button></div>
    <div className="metric-grid admin-metric-grid"><article className="metric-card"><span>Tổng người dùng</span><strong>{formatNumber(metrics.total_users)}</strong><small>{formatNumber(metrics.new_users_30d)} mới trong 30 ngày</small></article><article className="metric-card"><span>Người dùng hoạt động</span><strong>{formatNumber(metrics.active_users)}</strong><small>{formatNumber(metrics.suspended_users)} đang bị khóa</small></article><article className="metric-card"><span>Workspace hoạt động</span><strong>{formatNumber(metrics.active_workspaces)}</strong><small>{formatNumber(metrics.total_workspaces)} workspace tổng cộng</small></article><article className="metric-card"><span>Lượt gọi tháng này</span><strong>{formatNumber(metrics.usage_month)}</strong><small>Toàn hệ thống</small></article><article className="metric-card"><span>Kết nối Shopee</span><strong>{formatNumber(metrics.active_connections)}</strong><small>Đang hoạt động</small></article><article className="metric-card"><span>API key hoạt động</span><strong>{formatNumber(metrics.active_api_keys)}</strong><small>Chưa bị thu hồi</small></article></div>
    <article className="surface admin-growth-surface"><div className="surface-head"><span><h2>Người dùng mới</h2><p>14 ngày gần nhất.</p></span><span className="soft-label">Starter {formatNumber(plans.starter)} · Pro {formatNumber(plans.pro)} · Business {formatNumber(plans.business)}</span></div><div className="admin-spark-bars">{(overview?.signupDaily || []).map((item) => { const height = Math.min(100, Math.max(10, Math.ceil((Number(item.count || 0) / signupMax) * 10) * 10)); return <span key={item.day} title={`${item.count} người dùng`}><i style={{ height: `${height}%` }}/><small>{String(item.day).slice(5)}</small></span> })}</div></article>

    <article className="surface admin-section"><div className="surface-head"><span><h2>Người dùng</h2><p>Khóa tài khoản, quản lý quyền admin và thu hồi toàn bộ phiên đăng nhập.</p></span><form className="admin-filter" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const filter = { query: String(form.get('query') || '').trim(), status: String(form.get('status')) }; setUserFilter(filter); void loadUsers(1, filter).catch(showError) }}><input name="query" placeholder="Tên hoặc email" defaultValue={userFilter.query}/><select name="status" defaultValue={userFilter.status}><option value="all">Mọi trạng thái</option><option value="active">Hoạt động</option><option value="suspended">Bị khóa</option></select><button className="button button-primary" type="submit">Lọc</button></form></div><div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Quyền</th><th>Trạng thái</th><th>Workspace</th><th>Phiên</th><th>Hoạt động cuối</th><th>Thao tác</th></tr></thead><tbody>{users.items.length ? users.items.map((user) => { const [label, className] = adminStatus(user.status); const self = user.id === currentUserId; return <tr key={user.id}><td><span className="admin-identity"><strong>{user.name}</strong><small>{user.email}</small></span></td><td><span className={`admin-role-badge ${user.is_admin ? '' : 'member'}`}>{user.is_admin ? 'System admin' : 'Người dùng'}</span></td><td><span className={`status ${className}`}>{label}</span></td><td>{formatNumber(user.workspace_count)}</td><td>{formatNumber(user.active_sessions)}</td><td>{formatDateTime(user.last_seen_at)}</td><td><div className="admin-actions"><button type="button" className={user.status === 'active' ? 'danger' : ''} disabled={self} onClick={() => void updateUser(user, 'status')}>{user.status === 'active' ? 'Khóa' : 'Mở khóa'}</button><button type="button" disabled={self} onClick={() => void updateUser(user, 'admin')}>{user.is_admin ? 'Gỡ admin' : 'Cấp admin'}</button><button type="button" disabled={self || !user.active_sessions} onClick={() => void updateUser(user, 'sessions')}>Thu hồi phiên</button></div></td></tr> }) : <tr><td colSpan={7} className="empty-cell">Không tìm thấy người dùng phù hợp.</td></tr>}</tbody></table></div><Pagination {...users} onPage={(page) => void loadUsers(page).catch(showError)}/></article>

    <article className="surface admin-section"><div className="surface-head"><span><h2>Workspace & gói dịch vụ</h2><p>Điều chỉnh plan, quota hoặc tạm khóa toàn bộ workspace.</p></span><form className="admin-filter" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const filter = { query: String(form.get('query') || '').trim(), status: String(form.get('status')), plan: String(form.get('plan')) }; setWorkspaceFilter(filter); void loadWorkspaces(1, filter).catch(showError) }}><input name="query" placeholder="Workspace hoặc chủ sở hữu"/><select name="status" defaultValue="all"><option value="all">Mọi trạng thái</option><option value="active">Hoạt động</option><option value="suspended">Tạm khóa</option></select><select name="plan" defaultValue="all"><option value="all">Mọi gói</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="business">Business</option></select><button className="button button-primary" type="submit">Lọc</button></form></div><div className="table-wrap"><table><thead><tr><th>Workspace</th><th>Chủ sở hữu</th><th>Gói</th><th>Quota tháng</th><th>Đã dùng</th><th>Tài nguyên</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{workspaces.items.length ? workspaces.items.map((workspace) => { const [label, className] = adminStatus(workspace.status); return <tr key={workspace.id}><td><span className="admin-identity"><strong>{workspace.name}</strong><small>{workspace.slug}</small></span></td><td><span className="admin-identity"><strong>{workspace.owner_name}</strong><small>{workspace.owner_email}</small></span></td><td><span className="admin-role-badge member">{workspace.plan.toUpperCase()}</span></td><td>{formatNumber(workspace.monthly_quota)}</td><td>{formatNumber(workspace.usage_month)}</td><td><span className="admin-resource-copy">{formatNumber(workspace.member_count)} thành viên · {formatNumber(workspace.connection_count)} Shopee · {formatNumber(workspace.active_api_keys)} key</span></td><td><span className={`status ${className}`}>{label}</span></td><td><div className="admin-actions"><button type="button" onClick={() => setEditingWorkspace(workspace)}>Điều chỉnh</button><button type="button" className="danger" disabled={!workspace.active_api_keys} onClick={() => void revokeWorkspaceKeys(workspace)}>Thu hồi key</button></div></td></tr> }) : <tr><td colSpan={8} className="empty-cell">Không tìm thấy workspace phù hợp.</td></tr>}</tbody></table></div><Pagination {...workspaces} onPage={(page) => void loadWorkspaces(page).catch(showError)}/></article>

    <article className="surface admin-section"><div className="surface-head"><span><h2>Kết nối Shopee</h2><p>Chỉ hiển thị metadata và trạng thái; cookie mã hóa không bao giờ được trả về.</p></span><form className="admin-filter" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const filter = { query: String(form.get('query') || '').trim(), status: String(form.get('status')) }; setConnectionFilter(filter); void loadConnections(1, filter).catch(showError) }}><input name="query" placeholder="Tài khoản, workspace hoặc email"/><select name="status" defaultValue="all"><option value="all">Mọi trạng thái</option><option value="connected">Đang kết nối</option><option value="expired">Hết hạn</option><option value="error">Có lỗi</option></select><button className="button button-primary" type="submit">Lọc</button></form></div><div className="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Workspace</th><th>Affiliate</th><th>Trạng thái</th><th>Lỗi gần nhất</th><th>Kiểm tra cuối</th></tr></thead><tbody>{connections.items.length ? connections.items.map((connection) => { const [label, className] = adminStatus(connection.status); return <tr key={connection.id}><td><span className="admin-identity"><strong>{connection.name}</strong><small>{connection.is_default ? 'Mặc định' : 'Kết nối phụ'}</small></span></td><td><span className="admin-identity"><strong>{connection.workspace_name}</strong><small>{connection.owner_email}</small></span></td><td>{connection.affiliate_name || connection.affiliate_id || 'Chưa nhận diện'}</td><td><span className={`status ${className}`}>{label}</span></td><td>{connection.last_error_code || '—'}</td><td>{formatDateTime(connection.last_checked_at)}</td></tr> }) : <tr><td colSpan={6} className="empty-cell">Không tìm thấy kết nối phù hợp.</td></tr>}</tbody></table></div><Pagination {...connections} onPage={(page) => void loadConnections(page).catch(showError)}/></article>

    <article className="surface admin-section"><div className="surface-head"><span><h2>Nhật ký quản trị</h2><p>Mọi thay đổi quyền, trạng thái, plan, quota và lần thu hồi đều được ghi lại.</p></span><button className="quiet-button" type="button" onClick={() => void loadAudit(audit.page).catch(showError)}>Làm mới</button></div><div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Admin</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>{audit.items.length ? audit.items.map((entry, index) => <tr key={entry.id || index}><td>{formatDateTime(entry.created_at)}</td><td>{entry.actor_email}</td><td>{actionLabels[entry.action] || entry.action}</td><td>{entry.target_type} · {entry.target_id || '—'}</td><td><code className="admin-audit-meta" title={JSON.stringify(entry.metadata || {})}>{JSON.stringify(entry.metadata || {})}</code></td></tr>) : <tr><td colSpan={5} className="empty-cell">Chưa có thao tác quản trị nào.</td></tr>}</tbody></table></div><Pagination {...audit} onPage={(page) => void loadAudit(page).catch(showError)}/></article>

    <Modal open={Boolean(editingWorkspace)} onClose={() => setEditingWorkspace(null)} className="modal-small">{editingWorkspace && <form className="modal-form" onSubmit={saveWorkspace}><h2>Điều chỉnh workspace</h2><p>{editingWorkspace.name} · {editingWorkspace.owner_email}</p><label>Gói dịch vụ<select name="plan" defaultValue={editingWorkspace.plan}><option value="starter">Starter</option><option value="pro">Pro</option><option value="business">Business</option></select></label><label>Hạn mức tháng<input type="number" name="monthlyQuota" min={0} max={10_000_000} defaultValue={editingWorkspace.monthly_quota} required/></label><label>Trạng thái<select name="status" defaultValue={editingWorkspace.status}><option value="active">Hoạt động</option><option value="suspended">Tạm khóa</option></select><small>Tạm khóa sẽ thu hồi các phiên đăng nhập đang hoạt động.</small></label><button className="button button-primary button-block" type="submit">Lưu thay đổi</button></form>}</Modal>
  </section>
}
