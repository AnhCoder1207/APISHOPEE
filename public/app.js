const state = {
  bootstrap: null,
  reportRows: [],
  currentView: 'dashboard',
  admin: {
    loaded: false,
    users: { items: [], page: 1, totalPages: 1, query: '', status: 'all' },
    workspaces: { items: [], page: 1, totalPages: 1, query: '', status: 'all', plan: 'all' },
    connections: { items: [], page: 1, totalPages: 1, query: '', status: 'all' },
    audit: { items: [], page: 1, totalPages: 1 },
  },
}

const pageMeta = {
  dashboard: ['Tổng quan hôm nay', 'Theo dõi hoạt động Shopee Affiliate của bạn.'],
  convert: ['Tạo link affiliate', 'Chuyển tối đa 5 link Shopee trong một lượt.'],
  reports: ['Đơn hàng & hoa hồng', 'Lấy báo cáo chuyển đổi trực tiếp từ tài khoản Shopee.'],
  connections: ['Tài khoản Shopee', 'Quản lý phiên Affiliate đã được mã hóa.'],
  'api-keys': ['API key', 'Kết nối CamLink với bot và công cụ của riêng bạn.'],
  admin: ['Quản trị hệ thống', 'Theo dõi và điều hành toàn bộ CamLink.'],
}

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0))
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatInternalMoney(value) {
  return formatMoney(Number(value || 0) / 100_000)
}

function formatDateTime(value) {
  if (!value) return 'Chưa kiểm tra'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function localDate(daysAgo = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - daysAgo * 86_400_000))
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  $('#toast-region').append(toast)
  window.setTimeout(() => toast.remove(), 4200)
}

function setLoading(active, message = 'Đang xử lý...') {
  $('#loading-copy').textContent = message
  $('#loading-overlay').hidden = !active
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  const payload = await response.json().catch(() => ({ success: false, error: { message: 'Máy chủ trả về dữ liệu không hợp lệ' } }))
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Yêu cầu không thành công')
    error.code = payload?.error?.code
    error.status = response.status
    error.details = payload?.error?.details
    throw error
  }
  return payload.data
}

function showLanding() {
  state.bootstrap = null
  state.admin.loaded = false
  $('#landing-view').hidden = false
  $('#workspace-view').hidden = true
}

function showWorkspace() {
  $('#landing-view').hidden = true
  $('#workspace-view').hidden = false
}

function openDialog(id) {
  const dialog = document.getElementById(id)
  if (!dialog.open) dialog.showModal()
}

function closeDialog(id) {
  const dialog = document.getElementById(id)
  if (dialog.open) dialog.close()
}

function switchAuthTab(mode) {
  $$('[data-auth-tab]').forEach((button) => button.classList.toggle('active', button.dataset.authTab === mode))
  $('#login-form').hidden = mode !== 'login'
  $('#register-form').hidden = mode !== 'register'
}

function navigate(view) {
  if (!pageMeta[view]) view = 'dashboard'
  if (view === 'admin' && !state.bootstrap?.user?.isAdmin) view = 'dashboard'
  state.currentView = view
  $$('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === view))
  $$('.app-nav [data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view))
  $('#page-title').textContent = pageMeta[view][0]
  $('#page-subtitle').textContent = pageMeta[view][1]
  $('#top-create-button').hidden = view === 'admin'
  if (view === 'admin') {
    $('#connection-alert').hidden = true
    if (!state.admin.loaded) refreshAdmin().catch((error) => showToast(error.message, 'error'))
  } else if (state.bootstrap?.connections) {
    renderAlert(state.bootstrap.connections)
  }
  $('#app-sidebar').classList.remove('open')
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`)
}

function initials(name) {
  return String(name || 'U').trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

function renderConnectionOptions(connections) {
  for (const selector of ['#convert-connection', '#report-connection']) {
    const select = $(selector)
    select.innerHTML = connections.length
      ? connections.map((connection) => `<option value="${escapeHtml(connection.id)}" ${connection.is_default ? 'selected' : ''}>${escapeHtml(connection.name)}${connection.status !== 'connected' ? ' - cần cập nhật' : ''}</option>`).join('')
      : '<option value="">Chưa có tài khoản Shopee</option>'
    select.disabled = connections.length === 0
  }
}

function renderAlert(connections) {
  const alert = $('#connection-alert')
  const expired = connections.find((connection) => connection.status !== 'connected')
  if (connections.length === 0) {
    alert.hidden = false
    $('#connection-alert-copy').textContent = 'Bạn chưa kết nối tài khoản Shopee. Hãy tải file cookie JSON lên để bắt đầu.'
  } else if (expired) {
    alert.hidden = false
    $('#connection-alert-copy').textContent = `Phiên Shopee của ${expired.name} đã hết hạn hoặc gặp lỗi.`
  } else {
    alert.hidden = true
  }
}

function renderChart(daily = []) {
  const max = Math.max(1, ...daily.map((item) => Number(item.commission || 0)))
  const today = localDate(0)
  $('#dashboard-chart').innerHTML = daily.map((item) => {
    const rawPercent = Math.max(5, Math.round((Number(item.commission || 0) / max) * 100))
    const percent = Math.min(100, Math.max(10, Math.ceil(rawPercent / 10) * 10))
    const dayLabel = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(`${item.day}T12:00:00+07:00`))
    return `<div class="chart-day ${item.day === today ? 'is-today' : ''}" title="${escapeHtml(formatInternalMoney(item.commission))}"><i class="height-${percent}"></i><span>${escapeHtml(dayLabel)}</span></div>`
  }).join('') || '<div class="empty-cell">Chưa có dữ liệu đồng bộ.</div>'
}

function renderDashboardConnection(connections) {
  const connection = connections.find((item) => item.is_default) || connections[0]
  if (!connection) {
    $('#dashboard-connection').innerHTML = '<div class="connection-empty"><svg><use href="#icon-store"></use></svg><p>Chưa có tài khoản Shopee.</p><button class="button button-primary" type="button" data-view="connections">Thêm tài khoản</button></div>'
    return
  }
  $('#dashboard-connection').innerHTML = `<div class="connection-summary"><div class="connection-identity"><span class="connection-logo"><svg><use href="#icon-store"></use></svg></span><span><strong>${escapeHtml(connection.name)}</strong><small>${connection.status === 'connected' ? '● Đang kết nối' : '● Cần cập nhật file cookie'}</small></span></div><div class="connection-health"><b>Affiliate:</b> ${escapeHtml(connection.affiliate_name || connection.affiliate_id || 'Chưa nhận diện')}<br /><b>Kiểm tra lần cuối:</b> ${escapeHtml(formatDateTime(connection.last_checked_at))}</div></div>`
}

function linkTableRows(rows, dashboard = false) {
  if (!rows.length) return `<tr><td colspan="${dashboard ? 4 : 6}" class="empty-cell">Chưa có link nào được tạo.</td></tr>`
  return rows.map((row) => {
    const shortLink = safeExternalUrl(row.short_link)
    return `<tr><td title="${escapeHtml(row.original_link)}">${escapeHtml(row.original_link)}</td><td>${shortLink ? `<a class="table-link" href="${escapeHtml(shortLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortLink)}</a>` : '<span class="status cancelled">Thất bại</span>'}</td>${dashboard ? '' : `<td>${escapeHtml(row.sub_id_1 || '—')}</td><td>${escapeHtml(row.connection_name || '—')}</td>`}<td>${escapeHtml(formatDateTime(row.created_at))}</td><td>${shortLink ? `<button class="copy-button" type="button" data-copy-value="${escapeHtml(shortLink)}" aria-label="Sao chép link"><svg><use href="#icon-copy"></use></svg></button>` : ''}</td></tr>`
  }).join('')
}

function renderConnections(connections) {
  const cards = connections.map((connection) => `<article class="connection-card"><div class="connection-card-head"><span class="connection-logo"><svg><use href="#icon-store"></use></svg></span><span><strong>${escapeHtml(connection.name)}</strong><small>${escapeHtml(connection.affiliate_name || connection.affiliate_id || 'Chưa nhận diện')}</small></span></div><div class="connection-badges"><span class="${connection.status === 'connected' ? 'connected' : 'expired'}">${connection.status === 'connected' ? '● Đang kết nối' : '● Cần cập nhật'}</span>${connection.is_default ? '<span>Mặc định</span>' : ''}<span>${escapeHtml(formatDateTime(connection.last_checked_at))}</span></div><div class="connection-actions"><button type="button" data-connection-action="edit" data-connection-id="${escapeHtml(connection.id)}">Cập nhật file JSON</button><button type="button" data-connection-action="check" data-connection-id="${escapeHtml(connection.id)}">Kiểm tra lại</button><button type="button" class="danger" data-connection-action="delete" data-connection-id="${escapeHtml(connection.id)}">Xóa</button></div></article>`).join('')
  $('#connection-grid').innerHTML = `${cards}<button class="add-connection-card" type="button" data-add-connection><svg><use href="#icon-plus"></use></svg><strong>Thêm tài khoản Shopee</strong><small>Tải file JSON từ J2TEAM Cookies</small></button>`
}

function renderApiKeys(keys) {
  $('#api-key-list').innerHTML = keys.length
    ? keys.map((key) => `<div class="key-row"><span><strong>${escapeHtml(key.name)}</strong><code>${escapeHtml(key.key_prefix)}••••••••</code><code>Dùng gần nhất: ${escapeHtml(formatDateTime(key.last_used_at))}</code></span><button type="button" data-revoke-key="${escapeHtml(key.id)}">Thu hồi</button></div>`).join('')
    : '<div class="empty-state"><svg><use href="#icon-key"></use></svg><strong>Chưa có API key</strong><p>Tạo một key khi bạn cần gọi API từ hệ thống riêng.</p></div>'
}

function renderBootstrap(data) {
  state.bootstrap = data
  showWorkspace()
  const { user, usage, metrics, connections, recentLinks, apiKeys, daily } = data
  $('#sidebar-name').textContent = user.name
  $('#sidebar-avatar').textContent = initials(user.name)
  $('#sidebar-role').textContent = user.isAdmin ? 'Admin · Đăng xuất' : 'Đăng xuất'
  $('#admin-nav-button').hidden = !user.isAdmin
  const used = Number(usage.used || 0)
  const quota = Number(usage.monthly_quota || 0)
  const percent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 100
  $('#usage-percent').textContent = `${percent}%`
  $('#usage-copy').textContent = `${formatNumber(used)} / ${formatNumber(quota)} lượt gọi tháng này`
  $('#usage-meter-bar').style.width = `${percent}%`
  $('#metric-commission').textContent = formatInternalMoney(metrics.commission)
  $('#metric-orders').textContent = formatNumber(metrics.order_count)
  $('#metric-conversions').textContent = `${formatNumber(metrics.conversions)} lượt chuyển đổi`
  $('#metric-links').textContent = formatNumber(recentLinks.length)
  $('#metric-quota').textContent = formatNumber(Math.max(0, quota - used))
  renderAlert(connections)
  renderConnectionOptions(connections)
  renderDashboardConnection(connections)
  renderChart(daily)
  $('#dashboard-links-body').innerHTML = linkTableRows(recentLinks, true)
  renderConnections(connections)
  renderApiKeys(apiKeys)
  navigate(location.hash.slice(1) || state.currentView)
}

async function refreshBootstrap({ quiet = false } = {}) {
  if (!quiet) setLoading(true, 'Đang tải workspace...')
  try {
    renderBootstrap(await api('/api/app/bootstrap'))
  } finally {
    if (!quiet) setLoading(false)
  }
}

async function refreshHistory() {
  const rows = await api('/api/app/links/history?limit=100')
  $('#link-history-body').innerHTML = linkTableRows(rows)
}

function openConnectionDialog(connection = null) {
  const form = $('#connection-form')
  form.reset()
  form.elements.connectionId.value = connection?.id || ''
  form.elements.name.value = connection?.name || ''
  form.elements.cookieJson.required = !connection
  $('#cookie-file-name').textContent = connection ? 'Có thể bỏ qua nếu giữ cookie hiện tại.' : 'Chưa chọn file JSON'
  $('#cookie-file-summary').textContent = 'File chỉ được đọc trong trình duyệt rồi gửi an toàn tới máy chủ.'
  form.elements.isDefault.checked = Boolean(connection?.is_default)
  $('#connection-dialog-title').textContent = connection ? `Cập nhật ${connection.name}` : 'Thêm tài khoản Shopee'
  openDialog('connection-dialog')
}

async function readCookieExport(file) {
  if (!file) return null
  if (file.size > 512_000) throw new Error('File cookie vượt quá dung lượng tối đa 500 KB')
  if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
    throw new Error('Vui lòng chọn file JSON được xuất từ J2TEAM Cookies')
  }
  try {
    return JSON.parse(await file.text())
  } catch {
    throw new Error('File không phải JSON hợp lệ hoặc đã bị hỏng')
  }
}

function flattenReportEntry(entry) {
  const orders = Array.isArray(entry.orders) ? entry.orders : []
  let orderValue = 0
  for (const order of orders) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const quantity = Math.max(1, Number(item.qty || 0))
      orderValue += Number(item.actual_amount || 0) || Number(item.item_price || 0) * quantity
    }
  }
  return {
    checkoutId: String(entry.checkout_id || ''),
    purchaseTime: Number(entry.purchase_time || 0),
    source: String(entry.direct_source || entry.utm_content || 'Không xác định'),
    orderCount: orders.length,
    orderValue,
    commission: Number(entry.estimated_total_commission || 0),
    status: Number(entry.conversion_status || entry.checkout_status_app || 0),
  }
}

function statusLabel(status) {
  if (status === 2) return ['Hoàn thành', '']
  if (status === 3) return ['Đã hủy', 'cancelled']
  if (status === 4) return ['Chưa thanh toán', 'pending']
  return ['Chờ xử lý', 'pending']
}

function renderReport(entries) {
  state.reportRows = entries.map(flattenReportEntry)
  const totalValue = state.reportRows.reduce((sum, row) => sum + row.orderValue, 0)
  const totalCommission = state.reportRows.reduce((sum, row) => sum + row.commission, 0)
  $('#report-value').textContent = formatInternalMoney(totalValue)
  $('#report-commission').textContent = formatInternalMoney(totalCommission)
  $('#report-count').textContent = formatNumber(state.reportRows.length)
  $('#report-caption').textContent = `${formatNumber(state.reportRows.length)} lượt chuyển đổi trong trang hiện tại.`
  $('#export-report').disabled = state.reportRows.length === 0
  $('#report-body').innerHTML = state.reportRows.length ? state.reportRows.map((row) => {
    const [label, className] = statusLabel(row.status)
    const purchaseDate = row.purchaseTime ? formatDateTime(new Date(row.purchaseTime * 1000).toISOString()) : '—'
    return `<tr><td>${escapeHtml(row.checkoutId)}</td><td>${escapeHtml(purchaseDate)}</td><td>${escapeHtml(row.source)}</td><td>${formatNumber(row.orderCount)}</td><td>${escapeHtml(formatInternalMoney(row.orderValue))}</td><td>${escapeHtml(formatInternalMoney(row.commission))}</td><td><span class="status ${className}">${label}</span></td></tr>`
  }).join('') : '<tr><td colspan="7" class="empty-cell">Không có dữ liệu trong khoảng ngày này.</td></tr>'
}

function exportReportCsv() {
  if (!state.reportRows.length) return
  const header = ['Checkout', 'Ngày mua', 'Nguồn', 'Số đơn', 'Giá trị VND', 'Hoa hồng VND', 'Trạng thái']
  const rows = state.reportRows.map((row) => [
    row.checkoutId,
    row.purchaseTime ? new Date(row.purchaseTime * 1000).toISOString() : '',
    row.source,
    row.orderCount,
    Math.round(row.orderValue / 100_000),
    Math.round(row.commission / 100_000),
    statusLabel(row.status)[0],
  ])
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `camlink-report-${localDate()}.csv`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  showToast('Đã tạo file CSV')
}

function renderAdminPagination(section, data) {
  $(`#admin-${section}-page`).textContent = `Trang ${data.page} / ${data.totalPages}`
  const buttons = $$(`[data-admin-page="${section}"]`)
  buttons[0].disabled = data.page <= 1
  buttons[1].disabled = data.page >= data.totalPages
}

function adminStatus(status) {
  if (status === 'active' || status === 'connected') return ['Hoạt động', '']
  if (status === 'suspended') return ['Tạm khóa', 'cancelled']
  if (status === 'expired') return ['Hết hạn', 'pending']
  if (status === 'error') return ['Có lỗi', 'cancelled']
  return [status || 'Không rõ', 'pending']
}

function renderAdminOverview(data) {
  const metrics = data.metrics || {}
  $('#admin-total-users').textContent = formatNumber(metrics.total_users)
  $('#admin-new-users').textContent = `${formatNumber(metrics.new_users_30d)} mới trong 30 ngày`
  $('#admin-active-users').textContent = formatNumber(metrics.active_users)
  $('#admin-suspended-users').textContent = `${formatNumber(metrics.suspended_users)} đang bị khóa`
  $('#admin-active-workspaces').textContent = formatNumber(metrics.active_workspaces)
  $('#admin-total-workspaces').textContent = `${formatNumber(metrics.total_workspaces)} workspace tổng cộng`
  $('#admin-usage-month').textContent = formatNumber(metrics.usage_month)
  $('#admin-active-connections').textContent = formatNumber(metrics.active_connections)
  $('#admin-active-api-keys').textContent = formatNumber(metrics.active_api_keys)

  const planCounts = Object.fromEntries((data.planDistribution || []).map((item) => [item.plan, item.count]))
  $('#admin-plan-summary').textContent = `Starter ${formatNumber(planCounts.starter)} · Pro ${formatNumber(planCounts.pro)} · Business ${formatNumber(planCounts.business)}`
  const daily = data.signupDaily || []
  const max = Math.max(1, ...daily.map((item) => Number(item.count || 0)))
  $('#admin-signup-chart').innerHTML = daily.map((item) => {
    const percent = Math.min(100, Math.max(10, Math.ceil(((Number(item.count || 0) / max) * 100) / 10) * 10))
    return `<span title="${escapeHtml(`${item.count} người dùng`)}"><i class="height-${percent}"></i><small>${escapeHtml(String(item.day).slice(5))}</small></span>`
  }).join('')
}

function renderAdminUsers(data) {
  state.admin.users = { ...state.admin.users, ...data }
  const currentUserId = state.bootstrap?.user?.id
  $('#admin-users-body').innerHTML = data.items.length ? data.items.map((user) => {
    const [statusLabel, statusClass] = adminStatus(user.status)
    const isSelf = user.id === currentUserId
    return `<tr><td><span class="admin-identity"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span></td><td><span class="admin-role-badge ${user.is_admin ? '' : 'member'}">${user.is_admin ? 'System admin' : 'Người dùng'}</span></td><td><span class="status ${statusClass}">${statusLabel}</span></td><td>${formatNumber(user.workspace_count)}</td><td>${formatNumber(user.active_sessions)}</td><td>${escapeHtml(formatDateTime(user.last_seen_at))}</td><td><div class="admin-actions"><button type="button" class="${user.status === 'active' ? 'danger' : ''}" data-admin-user-action="status" data-user-id="${escapeHtml(user.id)}" ${isSelf ? 'disabled' : ''}>${user.status === 'active' ? 'Khóa' : 'Mở khóa'}</button><button type="button" data-admin-user-action="admin" data-user-id="${escapeHtml(user.id)}" ${isSelf ? 'disabled' : ''}>${user.is_admin ? 'Gỡ admin' : 'Cấp admin'}</button><button type="button" data-admin-user-action="sessions" data-user-id="${escapeHtml(user.id)}" ${isSelf || !user.active_sessions ? 'disabled' : ''}>Thu hồi phiên</button></div></td></tr>`
  }).join('') : '<tr><td colspan="7" class="empty-cell">Không tìm thấy người dùng phù hợp.</td></tr>'
  renderAdminPagination('users', data)
}

function renderAdminWorkspaces(data) {
  state.admin.workspaces = { ...state.admin.workspaces, ...data }
  $('#admin-workspaces-body').innerHTML = data.items.length ? data.items.map((workspace) => {
    const [statusLabel, statusClass] = adminStatus(workspace.status)
    return `<tr><td><span class="admin-identity"><strong>${escapeHtml(workspace.name)}</strong><small>${escapeHtml(workspace.slug)}</small></span></td><td><span class="admin-identity"><strong>${escapeHtml(workspace.owner_name)}</strong><small>${escapeHtml(workspace.owner_email)}</small></span></td><td><span class="admin-role-badge member">${escapeHtml(String(workspace.plan).toUpperCase())}</span></td><td>${formatNumber(workspace.monthly_quota)}</td><td>${formatNumber(workspace.usage_month)}</td><td><span class="admin-resource-copy">${formatNumber(workspace.member_count)} thành viên · ${formatNumber(workspace.connection_count)} Shopee · ${formatNumber(workspace.active_api_keys)} key</span></td><td><span class="status ${statusClass}">${statusLabel}</span></td><td><div class="admin-actions"><button type="button" data-admin-workspace-action="edit" data-workspace-id="${escapeHtml(workspace.id)}">Điều chỉnh</button><button type="button" class="danger" data-admin-workspace-action="keys" data-workspace-id="${escapeHtml(workspace.id)}" ${workspace.active_api_keys ? '' : 'disabled'}>Thu hồi key</button></div></td></tr>`
  }).join('') : '<tr><td colspan="8" class="empty-cell">Không tìm thấy workspace phù hợp.</td></tr>'
  renderAdminPagination('workspaces', data)
}

function renderAdminConnections(data) {
  state.admin.connections = { ...state.admin.connections, ...data }
  $('#admin-connections-body').innerHTML = data.items.length ? data.items.map((connection) => {
    const [statusLabel, statusClass] = adminStatus(connection.status)
    return `<tr><td><span class="admin-identity"><strong>${escapeHtml(connection.name)}</strong><small>${connection.is_default ? 'Mặc định' : 'Kết nối phụ'}</small></span></td><td><span class="admin-identity"><strong>${escapeHtml(connection.workspace_name)}</strong><small>${escapeHtml(connection.owner_email)}</small></span></td><td>${escapeHtml(connection.affiliate_name || connection.affiliate_id || 'Chưa nhận diện')}</td><td><span class="status ${statusClass}">${statusLabel}</span></td><td>${escapeHtml(connection.last_error_code || '—')}</td><td>${escapeHtml(formatDateTime(connection.last_checked_at))}</td></tr>`
  }).join('') : '<tr><td colspan="6" class="empty-cell">Không tìm thấy kết nối phù hợp.</td></tr>'
  renderAdminPagination('connections', data)
}

function renderAdminAudit(data) {
  state.admin.audit = { ...state.admin.audit, ...data }
  const actionLabels = {
    'user.update': 'Cập nhật người dùng',
    'user.sessions.revoke': 'Thu hồi phiên',
    'workspace.update': 'Cập nhật workspace',
    'workspace.api_keys.revoke': 'Thu hồi API key',
  }
  $('#admin-audit-body').innerHTML = data.items.length ? data.items.map((entry) => `<tr><td>${escapeHtml(formatDateTime(entry.created_at))}</td><td>${escapeHtml(entry.actor_email)}</td><td>${escapeHtml(actionLabels[entry.action] || entry.action)}</td><td>${escapeHtml(entry.target_type)} · ${escapeHtml(entry.target_id || '—')}</td><td><code class="admin-audit-meta" title="${escapeHtml(JSON.stringify(entry.metadata || {}))}">${escapeHtml(JSON.stringify(entry.metadata || {}))}</code></td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">Chưa có thao tác quản trị nào.</td></tr>'
  renderAdminPagination('audit', data)
}

async function loadAdminUsers() {
  const filter = state.admin.users
  const params = new URLSearchParams({ query: filter.query, status: filter.status, page: String(filter.page), limit: '25' })
  renderAdminUsers(await api(`/api/admin/users?${params}`))
}

async function loadAdminWorkspaces() {
  const filter = state.admin.workspaces
  const params = new URLSearchParams({ query: filter.query, status: filter.status, plan: filter.plan, page: String(filter.page), limit: '25' })
  renderAdminWorkspaces(await api(`/api/admin/workspaces?${params}`))
}

async function loadAdminConnections() {
  const filter = state.admin.connections
  const params = new URLSearchParams({ query: filter.query, status: filter.status, page: String(filter.page), limit: '25' })
  renderAdminConnections(await api(`/api/admin/connections?${params}`))
}

async function loadAdminAudit() {
  const filter = state.admin.audit
  renderAdminAudit(await api(`/api/admin/audit?page=${filter.page}&limit=25`))
}

async function refreshAdmin({ quiet = false } = {}) {
  if (!state.bootstrap?.user?.isAdmin) return
  if (!quiet) setLoading(true, 'Đang tải trung tâm quản trị...')
  try {
    const [overview] = await Promise.all([
      api('/api/admin/bootstrap'),
      loadAdminUsers(),
      loadAdminWorkspaces(),
      loadAdminConnections(),
      loadAdminAudit(),
    ])
    renderAdminOverview(overview)
    state.admin.loaded = true
  } finally {
    if (!quiet) setLoading(false)
  }
}

function openAdminWorkspaceDialog(workspace) {
  const form = $('#admin-workspace-form')
  form.elements.workspaceId.value = workspace.id
  form.elements.plan.value = workspace.plan
  form.elements.monthlyQuota.value = workspace.monthly_quota
  form.elements.status.value = workspace.status
  $('#admin-workspace-dialog-copy').textContent = `${workspace.name} · ${workspace.owner_email}`
  openDialog('admin-workspace-dialog')
}

document.addEventListener('click', async (event) => {
  const authButton = event.target.closest('[data-auth-mode]')
  if (authButton) {
    switchAuthTab(authButton.dataset.authMode)
    openDialog('auth-dialog')
    return
  }

  const authTab = event.target.closest('[data-auth-tab]')
  if (authTab) return switchAuthTab(authTab.dataset.authTab)

  const closeButton = event.target.closest('[data-close-dialog]')
  if (closeButton) return closeDialog(closeButton.dataset.closeDialog)

  const viewButton = event.target.closest('[data-view]')
  if (viewButton && !viewButton.dataset.authMode) {
    event.preventDefault()
    navigate(viewButton.dataset.view)
    if (viewButton.dataset.view === 'convert') refreshHistory().catch((error) => showToast(error.message, 'error'))
    return
  }

  const copyButton = event.target.closest('[data-copy-value], [data-copy-target]')
  if (copyButton) {
    const value = copyButton.dataset.copyValue || document.getElementById(copyButton.dataset.copyTarget)?.textContent
    if (value) await navigator.clipboard.writeText(value)
    showToast('Đã sao chép')
    return
  }

  if (event.target.closest('#menu-button')) {
    $('#app-sidebar').classList.toggle('open')
    return
  }

  if (event.target.closest('#add-connection-button') || event.target.closest('[data-add-connection]')) {
    openConnectionDialog()
    return
  }

  if (event.target.closest('#admin-refresh-button')) {
    await refreshAdmin()
    showToast('Dữ liệu quản trị đã được làm mới')
    return
  }

  if (event.target.closest('#admin-refresh-audit')) {
    await loadAdminAudit()
    return
  }

  const adminPageButton = event.target.closest('[data-admin-page]')
  if (adminPageButton) {
    const section = adminPageButton.dataset.adminPage
    const pageState = state.admin[section]
    pageState.page = Math.min(pageState.totalPages, Math.max(1, pageState.page + Number(adminPageButton.dataset.pageDirection)))
    const loaders = { users: loadAdminUsers, workspaces: loadAdminWorkspaces, connections: loadAdminConnections, audit: loadAdminAudit }
    await loaders[section]()
    return
  }

  const adminUserAction = event.target.closest('[data-admin-user-action]')
  if (adminUserAction) {
    const user = state.admin.users.items.find((item) => item.id === adminUserAction.dataset.userId)
    if (!user) return
    const action = adminUserAction.dataset.adminUserAction
    let path = `/api/admin/users/${user.id}`
    let body
    let message
    if (action === 'status') {
      const nextStatus = user.status === 'active' ? 'suspended' : 'active'
      if (!confirm(`${nextStatus === 'suspended' ? 'Khóa' : 'Mở khóa'} tài khoản ${user.email}?`)) return
      body = { status: nextStatus }
      message = nextStatus === 'suspended' ? 'Đã khóa tài khoản và thu hồi phiên' : 'Đã mở khóa tài khoản'
    } else if (action === 'admin') {
      const nextIsAdmin = !user.is_admin
      if (!confirm(`${nextIsAdmin ? 'Cấp' : 'Gỡ'} quyền system admin cho ${user.email}?`)) return
      body = { isAdmin: nextIsAdmin }
      message = nextIsAdmin ? 'Đã cấp quyền system admin' : 'Đã gỡ quyền system admin'
    } else {
      if (!confirm(`Thu hồi toàn bộ phiên đăng nhập của ${user.email}?`)) return
      path += '/revoke-sessions'
      message = 'Đã thu hồi toàn bộ phiên đăng nhập'
    }
    setLoading(true, 'Đang cập nhật quyền truy cập...')
    try {
      await api(path, { method: action === 'sessions' ? 'POST' : 'PATCH', body: body ? JSON.stringify(body) : undefined })
      await refreshAdmin({ quiet: true })
      showToast(message)
    } catch (error) { showToast(error.message, 'error') } finally { setLoading(false) }
    return
  }

  const adminWorkspaceAction = event.target.closest('[data-admin-workspace-action]')
  if (adminWorkspaceAction) {
    const workspace = state.admin.workspaces.items.find((item) => item.id === adminWorkspaceAction.dataset.workspaceId)
    if (!workspace) return
    if (adminWorkspaceAction.dataset.adminWorkspaceAction === 'edit') {
      openAdminWorkspaceDialog(workspace)
      return
    }
    if (!confirm(`Thu hồi toàn bộ API key đang hoạt động của workspace "${workspace.name}"?`)) return
    setLoading(true, 'Đang thu hồi API key...')
    try {
      await api(`/api/admin/workspaces/${workspace.id}/revoke-api-keys`, { method: 'POST' })
      await refreshAdmin({ quiet: true })
      showToast('Đã thu hồi toàn bộ API key của workspace')
    } catch (error) { showToast(error.message, 'error') } finally { setLoading(false) }
    return
  }

  const connectionAction = event.target.closest('[data-connection-action]')
  if (connectionAction) {
    const connection = state.bootstrap.connections.find((item) => item.id === connectionAction.dataset.connectionId)
    if (!connection) return
    if (connectionAction.dataset.connectionAction === 'edit') return openConnectionDialog(connection)
    if (connectionAction.dataset.connectionAction === 'check') {
      setLoading(true, 'Đang kiểm tra phiên Shopee...')
      try {
        await api(`/api/app/connections/${connection.id}/check`, { method: 'POST' })
        await refreshBootstrap({ quiet: true })
        showToast('Kết nối Shopee đang hoạt động')
      } catch (error) {
        await refreshBootstrap({ quiet: true }).catch(() => {})
        showToast(error.message, 'error')
      } finally { setLoading(false) }
      return
    }
    if (connectionAction.dataset.connectionAction === 'delete' && confirm(`Xóa tài khoản "${connection.name}" khỏi workspace?`)) {
      setLoading(true, 'Đang xóa kết nối...')
      try {
        await api(`/api/app/connections/${connection.id}`, { method: 'DELETE' })
        await refreshBootstrap({ quiet: true })
        showToast('Đã xóa tài khoản Shopee')
      } catch (error) { showToast(error.message, 'error') } finally { setLoading(false) }
    }
    return
  }

  if (event.target.closest('#create-key-button')) {
    $('#key-form').hidden = false
    $('#key-reveal').hidden = true
    $('#key-form').reset()
    openDialog('key-dialog')
    return
  }

  const revokeButton = event.target.closest('[data-revoke-key]')
  if (revokeButton && confirm('Thu hồi API key này? Các hệ thống đang dùng key sẽ ngừng hoạt động.')) {
    try {
      await api(`/api/app/api-keys/${revokeButton.dataset.revokeKey}`, { method: 'DELETE' })
      await refreshBootstrap({ quiet: true })
      showToast('Đã thu hồi API key')
    } catch (error) { showToast(error.message, 'error') }
  }
})

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  setLoading(true, 'Đang đăng nhập...')
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) })
    closeDialog('auth-dialog')
    await refreshBootstrap({ quiet: true })
    showToast('Đăng nhập thành công')
  } catch (error) { showToast(error.message, 'error') } finally { setLoading(false) }
})

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  setLoading(true, 'Đang tạo workspace...')
  try {
    await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password') }) })
    closeDialog('auth-dialog')
    await refreshBootstrap({ quiet: true })
    navigate('connections')
    showToast('Tài khoản đã sẵn sàng. Hãy kết nối Shopee.')
  } catch (error) { showToast(error.message, 'error') } finally { setLoading(false) }
})

$('#logout-button').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* Session may already be expired. */ }
  showLanding()
  history.replaceState(null, '', location.pathname)
})

$('#connection-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const id = form.get('connectionId')
  const body = { name: form.get('name'), isDefault: form.get('isDefault') === 'on' }
  try {
    const file = form.get('cookieJson')
    const cookieExport = file instanceof File && file.size > 0 ? await readCookieExport(file) : null
    if (!id && !cookieExport) throw new Error('Hãy chọn file JSON cookie từ J2TEAM Cookies')
    if (cookieExport) body.cookieJson = JSON.stringify(cookieExport)
  } catch (error) {
    showToast(error.message, 'error')
    return
  }
  setLoading(true, 'Đang kiểm tra cookie với Shopee...')
  try {
    await api(id ? `/api/app/connections/${id}` : '/api/app/connections', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) })
    closeDialog('connection-dialog')
    await refreshBootstrap({ quiet: true })
    showToast(id ? 'Đã cập nhật tài khoản Shopee' : 'Đã kết nối tài khoản Shopee')
  } catch (error) {
    if (error.code === 'SHOPEE_SESSION_EXPIRED' || error.code === 'SHOPEE_CONNECTION_FAILED' || error.code === 'SHOPEE_UPSTREAM_ERROR') {
      await refreshBootstrap({ quiet: true }).catch(() => {})
    }
    showToast(error.message, 'error')
  } finally { setLoading(false) }
})

$('#connection-cookie-file').addEventListener('change', async (event) => {
  const file = event.currentTarget.files?.[0]
  if (!file) return
  $('#cookie-file-name').textContent = file.name
  try {
    const cookieExport = await readCookieExport(file)
    const cookies = Array.isArray(cookieExport) ? cookieExport : cookieExport?.cookies
    const count = Array.isArray(cookies) ? cookies.length : 0
    if (!count) throw new Error('File không chứa danh sách cookies')
    $('#cookie-file-summary').textContent = `${formatNumber(count)} cookie đã sẵn sàng để kiểm tra`
  } catch (error) {
    event.currentTarget.value = ''
    $('#cookie-file-name').textContent = 'Chưa chọn file JSON'
    $('#cookie-file-summary').textContent = 'File chỉ được đọc trong trình duyệt rồi gửi an toàn tới máy chủ.'
    showToast(error.message, 'error')
  }
})

$('#convert-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.bootstrap?.connections?.length) return showToast('Hãy thêm tài khoản Shopee trước', 'error')
  const form = new FormData(event.currentTarget)
  const originalLinks = String(form.get('links') || '').split(/\r?\n/).map((link) => link.trim()).filter(Boolean)
  if (originalLinks.length < 1 || originalLinks.length > 5) return showToast('Vui lòng nhập từ 1 đến 5 link', 'error')
  const body = { connectionId: form.get('connectionId'), originalLinks }
  for (const field of ['subId1', 'subId2', 'subId3', 'subId4']) if (form.get(field)) body[field] = form.get(field)
  setLoading(true, 'Shopee đang tạo link affiliate...')
  try {
    const result = await api('/api/app/links/convert', { method: 'POST', body: JSON.stringify(body) })
    const items = result?.data?.batchCustomLink || []
    $('#result-count').textContent = `${items.filter((item) => item.failCode === 0).length} thành công`
    $('#convert-results').classList.remove('empty-state')
    $('#convert-results').innerHTML = items.map((item, index) => {
      const shortLink = safeExternalUrl(item.shortLink)
      return `<div class="result-item"><small>${escapeHtml(originalLinks[index] || '')}</small><div class="result-link-line">${shortLink ? `<a href="${escapeHtml(shortLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortLink)}</a><button class="copy-button" type="button" data-copy-value="${escapeHtml(shortLink)}" aria-label="Sao chép"><svg><use href="#icon-copy"></use></svg></button>` : `<span class="status cancelled">Không tạo được link · mã ${escapeHtml(item.failCode)}</span>`}</div></div>`
    }).join('')
    await Promise.all([refreshHistory(), refreshBootstrap({ quiet: true })])
    navigate('convert')
    showToast('Đã hoàn tất chuyển đổi link')
  } catch (error) {
    if (error.code === 'SHOPEE_SESSION_EXPIRED' || error.code === 'SHOPEE_CONNECTION_FAILED' || error.code === 'SHOPEE_UPSTREAM_ERROR') {
      await refreshBootstrap({ quiet: true }).catch(() => {})
    }
    showToast(error.message, 'error')
  } finally { setLoading(false) }
})

$('#refresh-history').addEventListener('click', () => refreshHistory().catch((error) => showToast(error.message, 'error')))

$('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.bootstrap?.connections?.length) return showToast('Hãy thêm tài khoản Shopee trước', 'error')
  const form = new FormData(event.currentTarget)
  const params = new URLSearchParams({ connectionId: form.get('connectionId'), startDate: form.get('startDate'), endDate: form.get('endDate'), limit: '100', page: '1' })
  if (form.get('status')) params.set('status', form.get('status'))
  if (form.get('orderId')) params.set('orderId', form.get('orderId'))
  setLoading(true, 'Đang lấy báo cáo từ Shopee...')
  try {
    const result = await api(`/api/app/reports/conversions?${params}`)
    renderReport(result?.data?.list || [])
    await refreshBootstrap({ quiet: true })
    navigate('reports')
    showToast(`Đã đồng bộ ${result?.meta?.returnedRecords ?? result?.meta?.syncedRecords ?? 0} lượt chuyển đổi`)
  } catch (error) {
    if (error.code === 'SHOPEE_SESSION_EXPIRED' || error.code === 'SHOPEE_CONNECTION_FAILED' || error.code === 'SHOPEE_UPSTREAM_ERROR') {
      await refreshBootstrap({ quiet: true }).catch(() => {})
    }
    showToast(error.message, 'error')
  } finally { setLoading(false) }
})

$('#export-report').addEventListener('click', exportReportCsv)

$('#key-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  try {
    const result = await api('/api/app/api-keys', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) })
    $('#new-api-key').textContent = result.key
    $('#key-form').hidden = true
    $('#key-reveal').hidden = false
    await refreshBootstrap({ quiet: true })
    navigate('api-keys')
  } catch (error) { showToast(error.message, 'error') }
})

$('#admin-user-filter').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  Object.assign(state.admin.users, { query: String(form.get('query') || '').trim(), status: form.get('status'), page: 1 })
  try { await loadAdminUsers() } catch (error) { showToast(error.message, 'error') }
})

$('#admin-workspace-filter').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  Object.assign(state.admin.workspaces, {
    query: String(form.get('query') || '').trim(),
    status: form.get('status'),
    plan: form.get('plan'),
    page: 1,
  })
  try { await loadAdminWorkspaces() } catch (error) { showToast(error.message, 'error') }
})

$('#admin-connection-filter').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  Object.assign(state.admin.connections, { query: String(form.get('query') || '').trim(), status: form.get('status'), page: 1 })
  try { await loadAdminConnections() } catch (error) { showToast(error.message, 'error') }
})

$('#admin-workspace-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const workspace = state.admin.workspaces.items.find((item) => item.id === form.get('workspaceId'))
  if (!workspace) return
  const body = {
    plan: form.get('plan'),
    status: form.get('status'),
    monthlyQuota: Number(form.get('monthlyQuota')),
  }
  if (body.status === 'suspended' && workspace.status !== 'suspended' && !confirm(`Tạm khóa workspace "${workspace.name}" và thu hồi các phiên đăng nhập?`)) return
  setLoading(true, 'Đang cập nhật workspace...')
  try {
    await api(`/api/admin/workspaces/${workspace.id}`, { method: 'PATCH', body: JSON.stringify(body) })
    closeDialog('admin-workspace-dialog')
    await refreshAdmin({ quiet: true })
    showToast('Đã cập nhật workspace')
  } catch (error) { showToast(error.message, 'error') } finally { setLoading(false) }
})

for (const dialog of $$('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}

window.addEventListener('hashchange', () => {
  if (!$('#workspace-view').hidden) navigate(location.hash.slice(1))
})

async function initialize() {
  const reportForm = $('#report-form')
  reportForm.elements.startDate.value = localDate(6)
  reportForm.elements.endDate.value = localDate(0)
  try {
    await api('/api/auth/me')
    await refreshBootstrap()
  } catch (error) {
    setLoading(false)
    if (error.status && error.status !== 401) showToast(error.message, 'error')
    showLanding()
  }
}

initialize()
