@extends('layouts.app', ['title' => 'Workspace - Camlink'])

@section('content')
<div class="shell dashboard-shell">
    <section class="dashboard-head"><div><div class="eyebrow">BẢNG ĐIỀU KHIỂN CAMLINK</div><h1>Quản lý API<br><span>Shopee Affiliate.</span></h1><p>{{ $workspace->name }} · Xin chào {{ $workspace->owner->name }} · Hạn mức làm mới ngày {{ \Carbon\Carbon::parse($usage['reset_at'])->format('d/m/Y') }}</p></div><div class="workspace-badge"><span class="status-dot"></span><div><small>TRẠNG THÁI</small><strong>{{ $workspace->status === 'active' ? 'Đang hoạt động' : 'Tạm dừng' }}</strong></div></div></section>
    @if(session('status'))<div class="notice"><span>✓</span>{{ session('status') }}</div>@endif
    @if($errors->any())<div class="error-list"><ul>@foreach($errors->all() as $error)<li>{{ $error }}</li>@endforeach</ul></div>@endif
    @if(session('new_api_key'))<div class="panel key-reveal"><div><span class="panel-kicker">LƯU LẠI NGAY</span><h2>API key mới của bạn</h2><p class="panel-copy">Key này chỉ xuất hiện một lần. Hãy lưu vào secret manager hoặc biến môi trường.</p></div><div class="secret secret-copy" data-copy-value="{{ session('new_api_key') }}"><code>{{ session('new_api_key') }}</code><button type="button" class="copy-button" data-copy>Chép key</button></div></div>@endif
    @php($usagePercent = $usage['monthly_quota'] > 0 ? min(100, round(($usage['used'] / $usage['monthly_quota']) * 100)) : 100)
    <div class="metric-grid"><div class="metric metric-usage"><div class="metric-top"><span>Đã dùng tháng này</span><i>↗</i></div><strong>{{ number_format($usage['used']) }} <small>units</small></strong><div class="progress"><span style="width: {{ $usagePercent }}%"></span></div><small>{{ $usagePercent }}% của {{ number_format($usage['monthly_quota']) }} units</small></div><div class="metric metric-orange"><div class="metric-top"><span>Còn lại</span><i>⌁</i></div><strong>{{ number_format($usage['remaining']) }}</strong><small>request units có thể sử dụng</small></div><div class="metric metric-blue"><div class="metric-top"><span>Kết nối Shopee</span><i>◌</i></div><strong>{{ $connections->count() }}</strong><small>{{ $connections->where('status', 'connected')->count() }} kết nối đang sẵn sàng</small></div><div class="metric metric-green"><div class="metric-top"><span>API key</span><i>↗</i></div><strong>{{ $apiKeys->count() }}</strong><small>key đang có hiệu lực</small></div></div>
    <section class="tool-launcher"><div class="tool-launcher-heading"><div><span class="panel-kicker">LÀM VIỆC TRỰC TIẾP</span><h2>Công cụ cho công việc hằng ngày</h2></div><p>Không cần viết request, không trừ quota API. Chọn một công cụ để bắt đầu.</p></div><div class="tool-launcher-grid"><a class="tool-launch-card tool-launch-link" href="{{ route('tools.convert-link') }}"><span class="tool-launch-icon">↗</span><div><strong>Tạo link Affiliate</strong><small>Dán tối đa 5 link Shopee và lấy link đã chuyển đổi.</small></div><b>→</b></a><a class="tool-launch-card tool-launch-report" href="{{ route('tools.conversion-reports') }}"><span class="tool-launch-icon">◌</span><div><strong>Báo cáo chuyển đổi</strong><small>Đồng bộ, lọc và đối soát đơn hàng theo ngày.</small></div><b>→</b></a></div></section>
    <div class="dashboard-grid">
        <section class="panel"><div class="panel-heading"><div><span class="panel-kicker">KẾT NỐI SHOPEE</span><h2>Thêm tài khoản Shopee</h2></div><span class="panel-icon">S</span></div><p class="panel-copy">Chọn file cookie JSON đã xuất sau khi đăng nhập <strong>affiliate.shopee.vn</strong>. Camlink dùng phiên đăng nhập này để tạo link Affiliate và lấy báo cáo đơn hàng, sau đó mã hoá trước khi lưu.</p><form method="post" action="{{ route('dashboard.connections.store') }}" enctype="multipart/form-data">@csrf<div class="field"><label for="connection_name">Tên để bạn dễ nhận biết</label><input id="connection_name" name="name" placeholder="Ví dụ: Tài khoản Shopee chính" value="{{ old('name') }}" required></div><div class="field"><label for="cookie_file">File cookie Shopee</label><label class="file-input" for="cookie_file" id="cookie-file-label"><span>↑</span><div><strong id="cookie-file-name">Chọn file cookie từ máy</strong><small id="cookie-file-meta">File JSON hoặc TXT, tối đa 500 KB</small></div><b class="file-selected-mark" id="cookie-file-mark" aria-hidden="true" hidden>✓</b></label><input class="native-file" id="cookie_file" name="cookie_file" type="file" accept="application/json,.json,.txt"></div><div class="file-feedback" id="cookie-file-feedback" hidden><span>✓</span><div><strong>Đã chọn file cookie</strong><small id="cookie-file-feedback-text"></small></div></div><div class="field"><label for="cookie_json">Không có file? Dán nội dung JSON tại đây</label><textarea id="cookie_json" name="cookie_json" placeholder='[{"domain":".shopee.vn","name":"SPC_U","value":"..."}]'></textarea></div><label class="check"><input type="checkbox" name="is_default" value="1"><span>Dùng tài khoản này làm mặc định</span></label><button class="button button-primary button-full" type="submit">Kiểm tra cookie và kết nối Shopee <span>→</span></button></form></section>
        <section class="panel"><div class="panel-heading"><div><span class="panel-kicker">TÀI KHOẢN ĐÃ KẾT NỐI</span><h2>Tài khoản Shopee</h2></div><span class="count-badge">{{ $connections->count() }}</span></div><p class="panel-copy">Camlink sẽ dùng các tài khoản này khi tạo link Affiliate và lấy báo cáo đơn hàng. Nếu phiên hết hạn, tải cookie mới ngay tại tài khoản này để tiếp tục.</p><div class="item-list connection-list">@forelse($connections as $connection)<div class="item connection-item"><div class="item-main"><span class="connection-avatar">{{ strtoupper(substr($connection->name, 0, 1)) }}</span><div><strong>{{ $connection->name }} @if($connection->is_default)<em class="default-tag">MẶC ĐỊNH</em>@endif</strong><small>{{ $connection->affiliate_name ?: 'Chưa nhận diện Affiliate' }}</small><small>Kiểm tra {{ optional($connection->last_checked_at)->diffForHumans() ?: 'chưa bao giờ' }}</small></div></div><div class="item-actions"><span class="status {{ $connection->status }}"><i></i>{{ $connection->status === 'connected' ? 'Sẵn sàng' : ($connection->status === 'expired' ? 'Cần cập nhật cookie' : 'Cần kiểm tra') }}</span><form method="post" action="{{ route('dashboard.connections.check', $connection) }}">@csrf<button class="icon-button" type="submit" title="Kiểm tra kết nối">↻</button></form><form method="post" action="{{ route('dashboard.connections.destroy', $connection) }}" data-confirm="Xoá kết nối {{ $connection->name }}?">@csrf @method('DELETE')<button class="icon-button danger" type="submit" title="Xoá kết nối">×</button></form></div><details class="connection-update"><summary>Cập nhật cookie</summary><form method="post" action="{{ route('dashboard.connections.update', $connection) }}" enctype="multipart/form-data">@csrf @method('PATCH')<div class="field"><label for="connection-name-{{ $connection->id }}">Tên kết nối</label><input id="connection-name-{{ $connection->id }}" name="name" value="{{ $connection->name }}" required></div><div class="field"><label for="connection-file-{{ $connection->id }}">File cookie mới</label><input id="connection-file-{{ $connection->id }}" name="cookie_file" type="file" accept="application/json,.json,.txt" required></div><button class="button button-outline button-small" type="submit">Kiểm tra và cập nhật</button></form></details></div>@empty<div class="empty-state"><span>◌</span><strong>Chưa có tài khoản Shopee</strong><p>Chọn file cookie ở ô bên trái để thêm kết nối đầu tiên.</p></div>@endforelse</div></section>
        <section class="panel panel-wide"><div class="panel-heading"><div><span class="panel-kicker">ACCESS KEYS</span><h2>API key</h2></div><a class="text-link" href="{{ route('docs') }}">Cách dùng key →</a></div><p class="panel-copy">Mỗi bot hoặc ứng dụng nên có một key riêng. Key đầy đủ chỉ hiện một lần sau khi tạo.</p><form class="key-form" method="post" action="{{ route('dashboard.api-keys.store') }}">@csrf<div class="field"><label for="key_name">Tên API key</label><input id="key_name" name="name" placeholder="Ví dụ: Bot Telegram" required></div><div class="field"><label for="expires_at">Ngày hết hạn <span>(không bắt buộc)</span></label><input id="expires_at" name="expires_at" type="date" min="{{ now()->addDay()->format('Y-m-d') }}"></div><button class="button button-primary" type="submit">Tạo key mới <span>↗</span></button></form><div class="table-wrap"><table class="data-table"><thead><tr><th>Tên key</th><th>Prefix</th><th>Lần dùng cuối</th><th>Hết hạn</th><th></th></tr></thead><tbody>@forelse($apiKeys as $key)<tr><td><strong>{{ $key->name }}</strong></td><td><code>{{ $key->key_prefix }}••••</code></td><td>{{ optional($key->last_used_at)->diffForHumans() ?: 'Chưa dùng' }}</td><td>{{ optional($key->expires_at)->format('d/m/Y') ?: 'Không giới hạn' }}</td><td><form method="post" action="{{ route('dashboard.api-keys.destroy', $key) }}" data-confirm="Thu hồi API key {{ $key->name }}?">@csrf @method('DELETE')<button class="table-action danger" type="submit">Thu hồi</button></form></td></tr>@empty<tr><td colspan="5"><div class="empty-row">Chưa có API key. Tạo key đầu tiên để tích hợp Camlink.</div></td></tr>@endforelse</tbody></table></div></section>
        <section class="panel panel-wide quickstart"><div class="quickstart-copy"><span class="panel-kicker">QUICK START</span><h2>Request đầu tiên của bạn</h2><p>Thay API key và link Shopee, sau đó chạy lệnh này trong terminal.</p><a class="button button-outline" href="{{ route('docs') }}">Mở tài liệu đầy đủ <span>→</span></a></div><div class="secret quickstart-code"><pre>curl -X POST {{ rtrim(config('app.url'), '/') }}/api/v1/affiliate/convert-link \
  -H "Authorization: Bearer clk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"original_links":["https://shopee.vn/..."]}'</pre></div></section>
    </div>
</div>
@push('scripts')
<script>
document.querySelectorAll('[data-confirm]').forEach((form) => form.addEventListener('submit', (event) => { if (!window.confirm(form.dataset.confirm)) event.preventDefault(); }));
async function copyText(value) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        return copied;
    } catch {
        return false;
    }
}
document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const copied = await copyText(button.closest('[data-copy-value]').dataset.copyValue);
    button.textContent = copied ? 'Đã chép' : 'Không thể chép';
    setTimeout(() => button.textContent = 'Chép key', 1600);
}));
const cookieInput = document.querySelector('#cookie_file');
if (cookieInput) {
    cookieInput.addEventListener('change', () => {
        const file = cookieInput.files?.[0];
        const label = document.querySelector('#cookie-file-label');
        const name = document.querySelector('#cookie-file-name');
        const meta = document.querySelector('#cookie-file-meta');
        const mark = document.querySelector('#cookie-file-mark');
        const feedback = document.querySelector('#cookie-file-feedback');
        const feedbackText = document.querySelector('#cookie-file-feedback-text');
        if (!file) {
            label?.classList.remove('is-selected');
            if (name) name.textContent = 'Chọn file cookie từ máy';
            if (meta) meta.textContent = 'File JSON hoặc TXT, tối đa 500 KB';
            if (mark) mark.hidden = true;
            if (feedback) feedback.hidden = true;
            return;
        }
        const size = file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} KB`;
        label?.classList.add('is-selected');
        if (name) name.textContent = file.name;
        if (meta) meta.textContent = `${size} · Sẵn sàng kiểm tra`;
        if (mark) mark.hidden = false;
        if (feedbackText) feedbackText.textContent = `${file.name} · ${size}`;
        if (feedback) feedback.hidden = false;
    });
}
</script>
@endpush
@endsection
