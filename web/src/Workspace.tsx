import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AdminPanel } from './AdminPanel'
import { Brand, Icon, Modal, type IconName } from './components'
import { api, copyText, exportReportCsv, flattenReportEntry, formatDateTime, formatInternalMoney, formatNumber, initials, isShopeeConnectionError, localDate, readCookieExport, safeExternalUrl, statusLabel } from './lib'
import type { Bootstrap, Connection, LinkRecord, ReportRow, View } from './types'

const pageMeta: Record<View, [string, string]> = {
  dashboard: ['Tổng quan hôm nay', 'Theo dõi hoạt động Shopee Affiliate của bạn.'],
  convert: ['Tạo link affiliate', 'Chuyển tối đa 5 link Shopee trong một lượt.'],
  reports: ['Đơn hàng & hoa hồng', 'Lấy báo cáo chuyển đổi trực tiếp từ tài khoản Shopee.'],
  connections: ['Tài khoản Shopee', 'Quản lý phiên Affiliate đã được mã hóa.'],
  'api-keys': ['API key', 'Kết nối CamLink với bot và công cụ của riêng bạn.'],
  admin: ['Quản trị hệ thống', 'Theo dõi và điều hành toàn bộ CamLink.'],
}

interface SharedProps {
  onRefresh: (quiet?: boolean) => Promise<void>
  onToast: (message: string, type?: 'success' | 'error') => void
  setLoading: (active: boolean, message?: string) => void
}

export function Workspace({ bootstrap, view, onView, onLogout, onRefresh, onToast, setLoading }: { bootstrap: Bootstrap; view: View; onView: (view: View) => void; onLogout: () => Promise<void> } & SharedProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [connectionModal, setConnectionModal] = useState<Connection | null | false>(false)
  const [keyModal, setKeyModal] = useState(false)
  const [keyReveal, setKeyReveal] = useState<string | null>(null)
  const navigate = (next: View) => { onView(next); setMenuOpen(false) }
  const expired = bootstrap.connections.find((connection) => connection.status !== 'connected')
  const usagePercent = Math.min(100, Math.round((bootstrap.usage.used / Math.max(1, bootstrap.usage.monthly_quota)) * 100))

  return <div id="workspace-view">
    <aside className={`app-sidebar${menuOpen ? ' open' : ''}`}>
      <a className="brand brand-inverse" href="#dashboard" onClick={(event) => { event.preventDefault(); navigate('dashboard') }}><Brand inverse /></a>
      <nav className="app-nav" aria-label="Điều hướng ứng dụng">
        <NavButton active={view === 'dashboard'} icon="grid" label="Tổng quan" onClick={() => navigate('dashboard')} />
        <NavButton active={view === 'convert'} icon="link" label="Tạo link" onClick={() => navigate('convert')} />
        <NavButton active={view === 'reports'} icon="receipt" label="Đơn hàng" onClick={() => navigate('reports')} />
        <NavButton active={view === 'connections'} icon="store" label="Tài khoản Shopee" onClick={() => navigate('connections')} />
        <NavButton active={view === 'api-keys'} icon="key" label="API key" onClick={() => navigate('api-keys')} />
        {bootstrap.user.isAdmin && <NavButton active={view === 'admin'} icon="shield" label="Quản trị hệ thống" onClick={() => navigate('admin')} />}
      </nav>
      <div className="usage-box"><div><span>Gói Starter</span><b>{usagePercent}%</b></div><div className="usage-meter"><i style={{ width: `${usagePercent}%` }} /></div><small>{formatNumber(bootstrap.usage.used)} / {formatNumber(bootstrap.usage.monthly_quota)} lượt gọi tháng này</small></div>
      <button className="sidebar-user" type="button" onClick={() => void onLogout()}><span className="avatar">{initials(bootstrap.user.name)}</span><span><b>{bootstrap.user.name}</b><small>{bootstrap.user.isAdmin ? 'Admin · Đăng xuất' : 'Đăng xuất'}</small></span><Icon name="logout" /></button>
    </aside>
    <main className="app-main">
      <header className="app-topbar"><button className="menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Mở menu"><Icon name="menu" /></button><div><h1>{pageMeta[view][0]}</h1><p>{pageMeta[view][1]}</p></div>{view !== 'admin' && <button className="button button-primary top-create-button" type="button" onClick={() => navigate('convert')}><Icon name="plus" />Tạo link</button>}</header>
      {view !== 'admin' && <ConnectionAlert connections={bootstrap.connections} expired={expired} onView={() => navigate('connections')} />}
      {view === 'dashboard' && <DashboardPanel bootstrap={bootstrap} onView={navigate} onToast={onToast} />}
      {view === 'convert' && <ConvertPanel bootstrap={bootstrap} onRefresh={onRefresh} onToast={onToast} setLoading={setLoading} />}
      {view === 'reports' && <ReportsPanel bootstrap={bootstrap} onRefresh={onRefresh} onToast={onToast} setLoading={setLoading} />}
      {view === 'connections' && <ConnectionsPanel connections={bootstrap.connections} onAdd={() => setConnectionModal(null)} onEdit={(connection) => setConnectionModal(connection)} onRefresh={onRefresh} onToast={onToast} setLoading={setLoading} />}
      {view === 'api-keys' && <ApiKeysPanel keys={bootstrap.apiKeys} onCreate={() => { setKeyReveal(null); setKeyModal(true) }} onRefresh={onRefresh} onToast={onToast} />}
      {view === 'admin' && bootstrap.user.isAdmin && <AdminPanel currentUserId={bootstrap.user.id} onToast={onToast} setLoading={setLoading} />}
    </main>
    <ConnectionModal open={connectionModal !== false} connection={connectionModal || null} onClose={() => setConnectionModal(false)} onSaved={onRefresh} onToast={onToast} setLoading={setLoading} />
    <KeyModal open={keyModal} reveal={keyReveal} onClose={() => setKeyModal(false)} onReveal={setKeyReveal} onRefresh={onRefresh} onToast={onToast} />
  </div>
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) {
  return <button type="button" className={active ? 'active' : ''} onClick={onClick}><Icon name={icon} /><span>{label}</span></button>
}

function ConnectionAlert({ connections, expired, onView }: { connections: Connection[]; expired?: Connection; onView: () => void }) {
  if (connections.length > 0 && !expired) return null
  return <div className="connection-alert"><Icon name="alert" /><span>{connections.length === 0 ? 'Bạn chưa kết nối tài khoản Shopee. Hãy tải file cookie JSON lên để bắt đầu.' : `Phiên Shopee của ${expired?.name} đã hết hạn hoặc gặp lỗi.`}</span><button type="button" onClick={onView}>Xử lý ngay</button></div>
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>
}

function SurfaceHead({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="surface-head"><span><h2>{title}</h2><p>{description}</p></span>{children}</div>
}

function DashboardPanel({ bootstrap, onView, onToast }: { bootstrap: Bootstrap; onView: (view: View) => void; onToast: (message: string) => void }) {
  const max = Math.max(1, ...bootstrap.daily.map((item) => Number(item.commission || 0)))
  const today = localDate(0)
  const connection = bootstrap.connections.find((item) => item.is_default) || bootstrap.connections[0]
  return <section className="app-panel active">
    <div className="metric-grid"><Metric label="Hoa hồng dự kiến" value={formatInternalMoney(bootstrap.metrics.commission)} note="30 ngày gần nhất" /><Metric label="Đơn hàng ghi nhận" value={formatNumber(bootstrap.metrics.order_count)} note={`${formatNumber(bootstrap.metrics.conversions)} lượt chuyển đổi`} /><Metric label="Link đã tạo" value={formatNumber(bootstrap.recentLinks.length)} note="Trong lịch sử gần đây" /><Metric label="Hạn mức còn lại" value={formatNumber(Math.max(0, bootstrap.usage.monthly_quota - bootstrap.usage.used))} note="Được làm mới đầu tháng" /></div>
    <div className="dashboard-grid"><article className="surface chart-surface"><SurfaceHead title="Hoa hồng theo ngày" description="7 ngày gần nhất, theo dữ liệu đã đồng bộ."><span className="soft-label">UTC+7</span></SurfaceHead><div className="dashboard-chart" aria-label="Biểu đồ hoa hồng 7 ngày">{bootstrap.daily.length ? bootstrap.daily.map((item) => { const percent = Math.min(100, Math.max(10, Math.ceil(Math.max(5, Math.round((Number(item.commission || 0) / max) * 100)) / 10) * 10)); const day = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(`${item.day}T12:00:00+07:00`)); return <div className={`chart-day ${item.day === today ? 'is-today' : ''}`} key={item.day} title={formatInternalMoney(item.commission)}><i className={`height-${percent}`} /><span>{day}</span></div> }) : <div className="empty-cell">Chưa có dữ liệu đồng bộ.</div>}</div></article>
      <article className="surface"><SurfaceHead title="Tài khoản đang dùng" description="Nguồn dữ liệu Shopee mặc định." />{connection ? <div className="connection-summary"><div className="connection-identity"><span className="connection-logo"><Icon name="store" /></span><span><strong>{connection.name}</strong><small>{connection.status === 'connected' ? '● Đang kết nối' : '● Cần cập nhật file cookie'}</small></span></div><div className="connection-health"><b>Affiliate:</b> {connection.affiliate_name || connection.affiliate_id || 'Chưa nhận diện'}<br /><b>Kiểm tra lần cuối:</b> {formatDateTime(connection.last_checked_at)}</div></div> : <div className="connection-empty"><Icon name="store" /><p>Chưa có tài khoản Shopee.</p><button className="button button-primary" type="button" onClick={() => onView('connections')}>Thêm tài khoản</button></div>}</article></div>
    <article className="surface table-surface"><SurfaceHead title="Link gần đây" description="Kết quả chuyển đổi mới nhất của workspace."><button className="quiet-button" type="button" onClick={() => onView('convert')}>Xem lịch sử</button></SurfaceHead><LinkTable rows={bootstrap.recentLinks} dashboard onToast={onToast} /></article>
  </section>
}

function LinkTable({ rows, dashboard = false, onToast }: { rows: LinkRecord[]; dashboard?: boolean; onToast: (message: string) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Link gốc</th><th>Link affiliate</th>{!dashboard && <><th>Sub ID 1</th><th>Tài khoản</th></>}<th>Thời gian</th><th /></tr></thead><tbody>{rows.length ? rows.map((row, index) => { const short = safeExternalUrl(row.short_link); return <tr key={row.id || `${row.original_link}-${index}`}><td title={row.original_link}>{row.original_link}</td><td>{short ? <a className="table-link" href={short} target="_blank" rel="noopener noreferrer">{short}</a> : <span className="status cancelled">Thất bại</span>}</td>{!dashboard && <><td>{row.sub_id_1 || '—'}</td><td>{row.connection_name || '—'}</td></>}<td>{formatDateTime(row.created_at)}</td><td>{short && <button className="copy-button" type="button" onClick={() => { void copyText(short); onToast('Đã sao chép') }} aria-label="Sao chép link"><Icon name="copy" /></button>}</td></tr> }) : <tr><td colSpan={dashboard ? 4 : 6} className="empty-cell">Chưa có link nào được tạo.</td></tr>}</tbody></table></div>
}

function ConvertPanel({ bootstrap, onRefresh, onToast, setLoading }: SharedProps & { bootstrap: Bootstrap }) {
  const [history, setHistory] = useState<LinkRecord[]>([])
  const [result, setResult] = useState<Array<{ originalLink: string; shortLink: string; failCode: number }>>([])
  const load = async () => setHistory(await api<LinkRecord[]>('/api/app/links/history?limit=100'))
  useEffect(() => { void load().catch((error) => onToast(error.message, 'error')) }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bootstrap.connections.length) return onToast('Hãy thêm tài khoản Shopee trước', 'error')
    const form = new FormData(event.currentTarget)
    const originalLinks = String(form.get('links') || '').split(/\r?\n/).map((link) => link.trim()).filter(Boolean)
    if (originalLinks.length < 1 || originalLinks.length > 5) return onToast('Vui lòng nhập từ 1 đến 5 link', 'error')
    const body: Record<string, unknown> = { connectionId: form.get('connectionId'), originalLinks }
    for (const field of ['subId1', 'subId2', 'subId3', 'subId4']) if (form.get(field)) body[field] = form.get(field)
    setLoading(true, 'Shopee đang tạo link affiliate...')
    try {
      const response: any = await api('/api/app/links/convert', { method: 'POST', body: JSON.stringify(body) })
      setResult((response?.data?.batchCustomLink || []).map((item: any, index: number) => ({ originalLink: originalLinks[index] || '', shortLink: safeExternalUrl(item.shortLink), failCode: item.failCode })))
      await Promise.all([load(), onRefresh(true)])
      onToast('Đã hoàn tất chuyển đổi link')
    } catch (error) {
      if (isShopeeConnectionError(error)) await onRefresh(true).catch(() => {})
      onToast(error instanceof Error ? error.message : 'Không thể tạo link', 'error')
    } finally { setLoading(false) }
  }
  return <section className="app-panel active"><div className="two-column-layout"><form className="surface form-surface" onSubmit={submit}><SurfaceHead title="Tạo link affiliate hàng loạt" description="Mỗi link một dòng, tối đa 5 link Shopee." /><label>Tài khoản Shopee<select name="connectionId" defaultValue={bootstrap.connections.find((item) => item.is_default)?.id || bootstrap.connections[0]?.id || ''} required disabled={!bootstrap.connections.length}>{bootstrap.connections.length ? bootstrap.connections.map((connection) => <option value={connection.id} key={connection.id}>{connection.name}{connection.status !== 'connected' ? ' - cần cập nhật' : ''}</option>) : <option value="">Chưa có tài khoản Shopee</option>}</select></label><label>Link sản phẩm<textarea name="links" rows={7} placeholder="https://shopee.vn/product/..." required /><small>Hỗ trợ shopee.vn, s.shopee.vn và shope.ee.</small></label><div className="form-grid">{['subId1', 'subId2', 'subId3', 'subId4'].map((field, index) => <label key={field}>Sub ID {index + 1}<input name={field} maxLength={100} pattern="[A-Za-z0-9]*" placeholder={index < 2 ? ['facebookreels', 'campaign2308'][index] : 'Tùy chọn'} /></label>)}</div><button className="button button-primary button-block" type="submit" disabled={!bootstrap.connections.length}>Tạo link affiliate</button></form><article className="surface result-surface"><SurfaceHead title="Kết quả" description="Link thành công sẽ được lưu tự động."><span className="soft-label">{result.length ? `${result.filter((item) => item.failCode === 0).length} thành công` : 'Chưa có dữ liệu'}</span></SurfaceHead>{result.length ? <div className="result-list">{result.map((item, index) => <div className="result-item" key={`${item.originalLink}-${index}`}><small>{item.originalLink}</small><div className="result-link-line">{item.shortLink ? <><a href={item.shortLink} target="_blank" rel="noopener noreferrer">{item.shortLink}</a><button className="copy-button" type="button" onClick={() => { void copyText(item.shortLink); onToast('Đã sao chép') }}><Icon name="copy" /></button></> : <span className="status cancelled">Không tạo được link · mã {item.failCode}</span>}</div></div>)}</div> : <div className="result-list empty-state"><Icon name="link" /><strong>Sẵn sàng tạo link</strong><p>Kết quả rút gọn sẽ xuất hiện tại đây.</p></div>}</article></div><article className="surface table-surface"><SurfaceHead title="Lịch sử tạo link" description="Tối đa 100 kết quả gần nhất."><button className="quiet-button" type="button" onClick={() => void load().catch((error) => onToast(error.message, 'error'))}>Làm mới</button></SurfaceHead><LinkTable rows={history} onToast={onToast} /></article></section>
}

function ReportsPanel({ bootstrap, onRefresh, onToast, setLoading }: SharedProps & { bootstrap: Bootstrap }) {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [date, setDate] = useState({ startDate: localDate(6), endDate: localDate(0) })
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bootstrap.connections.length) return onToast('Hãy thêm tài khoản Shopee trước', 'error')
    const form = new FormData(event.currentTarget)
    const params = new URLSearchParams({ connectionId: String(form.get('connectionId')), startDate: String(form.get('startDate')), endDate: String(form.get('endDate')), limit: '100', page: '1' })
    if (form.get('status')) params.set('status', String(form.get('status')))
    if (form.get('orderId')) params.set('orderId', String(form.get('orderId')))
    setLoading(true, 'Đang lấy báo cáo từ Shopee...')
    try {
      const result: any = await api(`/api/app/reports/conversions?${params}`)
      setRows((result?.data?.list || []).map(flattenReportEntry))
      await onRefresh(true)
      onToast(`Đã đồng bộ ${result?.meta?.returnedRecords ?? result?.meta?.syncedRecords ?? 0} lượt chuyển đổi`)
    } catch (error) {
      if (isShopeeConnectionError(error)) await onRefresh(true).catch(() => {})
      onToast(error instanceof Error ? error.message : 'Không thể lấy báo cáo', 'error')
    } finally { setLoading(false) }
  }
  const totalValue = rows.reduce((sum, row) => sum + row.orderValue, 0)
  const totalCommission = rows.reduce((sum, row) => sum + row.commission, 0)
  return <section className="app-panel active"><form className="surface filter-bar" onSubmit={submit}><label>Tài khoản<select name="connectionId" defaultValue={bootstrap.connections.find((item) => item.is_default)?.id || bootstrap.connections[0]?.id || ''} required disabled={!bootstrap.connections.length}>{bootstrap.connections.map((connection) => <option value={connection.id} key={connection.id}>{connection.name}</option>)}</select></label><label>Từ ngày<input type="date" name="startDate" value={date.startDate} onChange={(event) => setDate((current) => ({ ...current, startDate: event.target.value }))} required /></label><label>Đến ngày<input type="date" name="endDate" value={date.endDate} onChange={(event) => setDate((current) => ({ ...current, endDate: event.target.value }))} required /></label><label>Trạng thái<select name="status"><option value="">Tất cả</option><option value="1">Chờ xử lý</option><option value="2">Hoàn thành</option><option value="3">Đã hủy</option><option value="4">Chưa thanh toán</option></select></label><label>Mã đơn<input name="orderId" placeholder="Tùy chọn" /></label><button className="button button-primary" type="submit" disabled={!bootstrap.connections.length}>Lấy báo cáo</button></form><div className="report-metrics"><Metric label="Tổng giá trị" value={formatInternalMoney(totalValue)} /><Metric label="Hoa hồng dự kiến" value={formatInternalMoney(totalCommission)} /><Metric label="Lượt chuyển đổi" value={formatNumber(rows.length)} /></div><article className="surface table-surface"><SurfaceHead title="Báo cáo chuyển đổi" description={rows.length ? `${formatNumber(rows.length)} lượt chuyển đổi trong trang hiện tại.` : 'Chọn khoảng ngày để tải dữ liệu trực tiếp từ Shopee.'}><button className="quiet-button" type="button" disabled={!rows.length} onClick={() => exportReportCsv(rows)}><Icon name="download" />Xuất CSV</button></SurfaceHead><div className="table-wrap"><table><thead><tr><th>Checkout</th><th>Ngày mua</th><th>Nguồn / Sub ID</th><th>Đơn hàng</th><th>Giá trị</th><th>Hoa hồng</th><th>Trạng thái</th></tr></thead><tbody>{rows.length ? rows.map((row) => { const [label, className] = statusLabel(row.status); return <tr key={row.checkoutId}><td>{row.checkoutId}</td><td>{row.purchaseTime ? formatDateTime(new Date(row.purchaseTime * 1000).toISOString()) : '—'}</td><td>{row.source}</td><td>{formatNumber(row.orderCount)}</td><td>{formatInternalMoney(row.orderValue)}</td><td>{formatInternalMoney(row.commission)}</td><td><span className={`status ${className}`}>{label}</span></td></tr> }) : <tr><td colSpan={7} className="empty-cell">Chưa có dữ liệu báo cáo.</td></tr>}</tbody></table></div></article></section>
}

function ConnectionsPanel({ connections, onAdd, onEdit, onRefresh, onToast, setLoading }: { connections: Connection[]; onAdd: () => void; onEdit: (connection: Connection) => void } & SharedProps) {
  const check = async (connection: Connection) => { setLoading(true, 'Đang kiểm tra phiên Shopee...'); try { await api(`/api/app/connections/${connection.id}/check`, { method: 'POST' }); await onRefresh(true); onToast('Kết nối Shopee đang hoạt động') } catch (error) { await onRefresh(true).catch(() => {}); onToast(error instanceof Error ? error.message : 'Không thể kiểm tra kết nối', 'error') } finally { setLoading(false) } }
  const remove = async (connection: Connection) => { if (!confirm(`Xóa tài khoản "${connection.name}" khỏi workspace?`)) return; setLoading(true, 'Đang xóa kết nối...'); try { await api(`/api/app/connections/${connection.id}`, { method: 'DELETE' }); await onRefresh(true); onToast('Đã xóa tài khoản Shopee') } catch (error) { onToast(error instanceof Error ? error.message : 'Không thể xóa kết nối', 'error') } finally { setLoading(false) } }
  return <section className="app-panel active"><div className="panel-intro"><span><h2>Tài khoản Shopee Affiliate</h2><p>Xuất cookie bằng J2TEAM Cookies rồi tải file JSON lên; CamLink tự lọc và mã hóa trước khi lưu.</p></span><button className="button button-primary" type="button" onClick={onAdd}><Icon name="plus" />Thêm tài khoản</button></div><div className="connection-grid">{connections.map((connection) => <article className="connection-card" key={connection.id}><div className="connection-card-head"><span className="connection-logo"><Icon name="store" /></span><span><strong>{connection.name}</strong><small>{connection.affiliate_name || connection.affiliate_id || 'Chưa nhận diện'}</small></span></div><div className="connection-badges"><span className={connection.status === 'connected' ? 'connected' : 'expired'}>{connection.status === 'connected' ? '● Đang kết nối' : '● Cần cập nhật'}</span>{connection.is_default && <span>Mặc định</span>}<span>{formatDateTime(connection.last_checked_at)}</span></div><div className="connection-actions"><button type="button" onClick={() => onEdit(connection)}>Cập nhật file JSON</button><button type="button" onClick={() => void check(connection)}>Kiểm tra lại</button><button type="button" className="danger" onClick={() => void remove(connection)}>Xóa</button></div></article>)}<button className="add-connection-card" type="button" onClick={onAdd}><Icon name="plus" /><strong>Thêm tài khoản Shopee</strong><small>Tải file JSON từ J2TEAM Cookies</small></button></div><article className="cookie-guide"><span className="guide-index">J2</span><div><h3>Cách lấy cookie an toàn</h3><ol><li>Đăng nhập tại affiliate.shopee.vn.</li><li>Mở extension J2TEAM Cookies và xuất cookies thành file JSON.</li><li>Vào CamLink, bấm “Thêm tài khoản Shopee” rồi chọn file vừa tải.</li><li>CamLink chỉ giữ header cookie đã mã hóa; file JSON không được lưu lại.</li></ol><p>Cookie là thông tin đăng nhập. Không gửi file cho người khác và hãy xóa file khỏi thư mục Downloads sau khi import.</p></div></article></section>
}

function ApiKeysPanel({ keys, onCreate, onRefresh, onToast }: { keys: Bootstrap['apiKeys']; onCreate: () => void; onRefresh: (quiet?: boolean) => Promise<void>; onToast: (message: string, type?: 'success' | 'error') => void }) {
  const revoke = async (id: string) => {
    if (!confirm('Thu hồi API key này? Các hệ thống đang dùng key sẽ ngừng hoạt động.')) return
    try {
      await api(`/api/app/api-keys/${id}`, { method: 'DELETE' })
      await onRefresh(true)
      onToast('Đã thu hồi API key')
    } catch (error) { onToast(error instanceof Error ? error.message : 'Không thể thu hồi API key', 'error') }
  }
  const curlExample = ['curl -X POST https://your-domain/api/v1/affiliate/convert-link', '  -H "Authorization: Bearer clk_live_..."', '  -H "Content-Type: application/json"', "  -d '{", '    "originalLinks": ["https://shopee.vn/product/..."],', '    "subId1": "facebook_reels"', "  }'"].join('\n')
  return <section className="app-panel active"><div className="panel-intro"><span><h2>API key cho hệ thống riêng</h2><p>Mỗi key chỉ hiển thị đầy đủ một lần và có thể thu hồi ngay lập tức.</p></span><button className="button button-primary" type="button" onClick={onCreate}><Icon name="plus" />Tạo API key</button></div><div className="api-layout"><article className="surface"><SurfaceHead title="Key đang hoạt động" description="Không lưu API key ở frontend hoặc repository công khai." /><div className="key-list">{keys.length ? keys.map((key) => <div className="key-row" key={key.id}><span><strong>{key.name}</strong><code>{key.key_prefix}••••••••</code><code>Dùng gần nhất: {formatDateTime(key.last_used_at)}</code></span><button type="button" onClick={() => void revoke(key.id)}>Thu hồi</button></div>) : <div className="empty-state"><Icon name="key" /><strong>Chưa có API key</strong><p>Tạo một key khi bạn cần gọi API từ hệ thống riêng.</p></div>}</div></article><article className="surface api-doc"><SurfaceHead title="Gọi API đổi link" description="Sử dụng tài khoản Shopee mặc định nếu bỏ qua connectionId." /><pre><code>{curlExample}</code></pre><p className="api-note">Endpoint báo cáo: <code>POST /api/v1/affiliate/conversion-reports</code></p></article></div></section>
}

function ConnectionModal({ open, connection, onClose, onSaved, onToast, setLoading }: { open: boolean; connection: Connection | null; onClose: () => void; onSaved: (quiet?: boolean) => Promise<void>; onToast: (message: string, type?: 'success' | 'error') => void; setLoading: (active: boolean, message?: string) => void }) {
  const [fileName, setFileName] = useState('Chưa chọn file JSON')
  const [fileSummary, setFileSummary] = useState('File chỉ được đọc trong trình duyệt rồi gửi an toàn tới máy chủ.')
  useEffect(() => { setFileName(connection ? 'Có thể bỏ qua nếu giữ cookie hiện tại.' : 'Chưa chọn file JSON'); setFileSummary('File chỉ được đọc trong trình duyệt rồi gửi an toàn tới máy chủ.') }, [connection, open])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get('cookieJson')
    let cookieJson: string | null = null
    try {
      if (file instanceof File && file.size > 0) cookieJson = JSON.stringify(await readCookieExport(file))
      if (!connection && !cookieJson) throw new Error('Hãy chọn file JSON cookie từ J2TEAM Cookies')
    } catch (error) { onToast(error instanceof Error ? error.message : 'File cookie không hợp lệ', 'error'); return }
    const body: Record<string, unknown> = { name: form.get('name'), isDefault: form.get('isDefault') === 'on' }
    if (cookieJson) body.cookieJson = cookieJson
    setLoading(true, 'Đang kiểm tra cookie với Shopee...')
    try {
      await api(connection ? `/api/app/connections/${connection.id}` : '/api/app/connections', { method: connection ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      onClose()
      await onSaved(true)
      onToast(connection ? 'Đã cập nhật tài khoản Shopee' : 'Đã kết nối tài khoản Shopee')
    } catch (error) {
      if (isShopeeConnectionError(error)) await onSaved(true).catch(() => {})
      onToast(error instanceof Error ? error.message : 'Không thể lưu tài khoản Shopee', 'error')
    } finally { setLoading(false) }
  }
  return <Modal open={open} onClose={onClose}><form className="modal-form" key={connection?.id || 'new'} onSubmit={submit}><h2>{connection ? `Cập nhật ${connection.name}` : 'Thêm tài khoản Shopee'}</h2><p>CamLink sẽ đọc file J2TEAM Cookies, kiểm tra với Shopee rồi mã hóa header trước khi lưu.</p><label>Tên tài khoản<input name="name" defaultValue={connection?.name || ''} placeholder="Nguyễn An Affiliate" minLength={2} required /></label><label>File cookie JSON<div className="cookie-file-drop"><input className="cookie-file-input" type="file" name="cookieJson" accept=".json,application/json" required={!connection} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setFileName(file.name); try { const value: any = await readCookieExport(file); const cookies = Array.isArray(value) ? value : value?.cookies; if (!Array.isArray(cookies) || !cookies.length) throw new Error('File không chứa danh sách cookies'); setFileSummary(`${formatNumber(cookies.length)} cookie đã sẵn sàng để kiểm tra`) } catch (error) { event.target.value = ''; setFileName('Chưa chọn file JSON'); setFileSummary('File chỉ được đọc trong trình duyệt rồi gửi an toàn tới máy chủ.'); onToast(error instanceof Error ? error.message : 'File cookie không hợp lệ', 'error') } }} /><span className="cookie-file-icon"><Icon name="download" /></span><span><strong>{fileName}</strong><small>{fileSummary}</small></span></div><small>Chỉ hỗ trợ file xuất từ J2TEAM Cookies cho affiliate.shopee.vn. File gốc không được lưu.</small></label><label className="check-label"><input type="checkbox" name="isDefault" defaultChecked={Boolean(connection?.is_default)} /> Đặt làm tài khoản mặc định</label><button className="button button-primary button-block" type="submit">Kiểm tra và lưu</button></form></Modal>
}

function KeyModal({ open, reveal, onClose, onReveal, onRefresh, onToast }: { open: boolean; reveal: string | null; onClose: () => void; onReveal: (value: string) => void; onRefresh: (quiet?: boolean) => Promise<void>; onToast: (message: string, type?: 'success' | 'error') => void }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const result = await api<{ key: string }>('/api/app/api-keys', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) })
      onReveal(result.key)
      await onRefresh(true)
    } catch (error) { onToast(error instanceof Error ? error.message : 'Không thể tạo API key', 'error') }
  }
  return <Modal open={open} onClose={onClose} className="modal-small">{reveal ? <div id="key-reveal"><h2>API key đã tạo</h2><p>Sao chép ngay. Bạn sẽ không thể xem lại toàn bộ key.</p><div className="secret-reveal"><code>{reveal}</code><button className="icon-button" type="button" onClick={() => { void copyText(reveal); onToast('Đã sao chép') }} aria-label="Sao chép API key"><Icon name="copy" /></button></div><button className="button button-primary button-block" type="button" onClick={onClose}>Tôi đã lưu key</button></div> : <form className="modal-form" onSubmit={submit}><h2>Tạo API key</h2><p>Đặt tên theo ứng dụng sẽ sử dụng key này.</p><label>Tên API key<input name="name" placeholder="Bot đăng bài" minLength={2} required /></label><button className="button button-primary button-block" type="submit">Tạo key</button></form>}</Modal>
}
