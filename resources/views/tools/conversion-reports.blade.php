@extends('layouts.app', ['title' => 'Báo cáo chuyển đổi - Camlink'])

@section('content')
<div class="shell tools-shell">
    <section class="tool-hero report-hero">
        <div>
            <div class="eyebrow"><span class="eyebrow-dot"></span> Conversion Reports</div>
            <h1>Xem báo cáo<br><span>chuyển đổi.</span></h1>
            <p>Đồng bộ đơn hàng từ Shopee, lọc theo ngày hoặc mã đơn và đối soát ngay trên web. Luồng này không trừ hạn mức API.</p>
        </div>
        <div class="tool-hero-side report-hero-side">
            <span class="tool-hero-icon">◌</span>
            <strong>Dữ liệu của workspace</strong>
            <small>Bản ghi đã đồng bộ được lưu lại để tra cứu nhanh hơn.</small>
        </div>
    </section>

    @if(session('status'))
        <div class="notice"><span>✓</span>{{ session('status') }}</div>
    @endif
    @if($errors->any())
        <div class="error-list"><ul>@foreach($errors->all() as $error)<li>{{ $error }}</li>@endforeach</ul></div>
    @endif
    @if($connections->isEmpty())
        <div class="tool-prerequisite">
            <span>S</span>
            <div><strong>Chưa thể đồng bộ dữ liệu mới</strong><p>Hãy kết nối một tài khoản Shopee. Bạn vẫn có thể xem hoặc xuất các bản ghi đã lưu trước đó.</p></div>
            <a class="button button-primary button-small" href="{{ route('dashboard') }}">Thêm kết nối →</a>
        </div>
    @endif
    @php($selectedConnection = $filters['connection_id'] ? $connections->firstWhere('id', $filters['connection_id']) : null)
    @php($canSync = $selectedConnection ? $selectedConnection->status === 'connected' : $connections->contains('status', 'connected'))

    <section class="panel report-filter-panel">
        <div class="panel-heading">
            <div><span class="panel-kicker">BỘ LỌC BÁO CÁO</span><h2>Chọn dữ liệu cần xem</h2></div>
            <span class="count-badge">WEB</span>
        </div>
        <form class="report-filter-grid" method="get" action="{{ route('tools.conversion-reports') }}">
            <div class="field"><label for="start_date">Từ ngày</label><input id="start_date" name="start_date" type="date" max="{{ now()->format('Y-m-d') }}" value="{{ $filters['start_date'] }}" required></div>
            <div class="field"><label for="end_date">Đến ngày</label><input id="end_date" name="end_date" type="date" max="{{ now()->format('Y-m-d') }}" value="{{ $filters['end_date'] }}" required></div>
            <div class="field"><label for="connection_id">Tài khoản Shopee</label><select id="connection_id" name="connection_id"><option value="">Tất cả kết nối</option>@foreach($connections as $connection)<option value="{{ $connection->id }}" @selected($filters['connection_id'] == $connection->id)>{{ $connection->name }}{{ $connection->status !== 'connected' ? ' · Cần cập nhật cookie' : '' }}</option>@endforeach</select></div>
            <div class="field"><label for="order_id">Mã đơn / checkout ID</label><input id="order_id" name="order_id" value="{{ $filters['order_id'] }}" placeholder="Nhập mã đơn nếu cần"></div>
            <div class="field"><label for="status">Trạng thái</label><select id="status" name="status"><option value="">Tất cả trạng thái</option>@foreach($statusLabels as $value => $label)<option value="{{ $value }}" @selected($filters['status'] === $value)>{{ $label }}</option>@endforeach</select></div>
            <button class="button button-outline" type="submit">Lọc dữ liệu đã có <span>→</span></button>
        </form>
        <div class="sync-divider"><span>hoặc cập nhật dữ liệu mới từ Shopee</span></div>
        <form class="sync-form" method="post" action="{{ route('tools.conversion-reports.sync') }}">
            @csrf
            <input type="hidden" name="start_date" value="{{ $filters['start_date'] }}">
            <input type="hidden" name="end_date" value="{{ $filters['end_date'] }}">
            <input type="hidden" name="connection_id" value="{{ $filters['connection_id'] }}">
            <input type="hidden" name="limit" value="100">
            <input type="hidden" name="page" value="1">
            <input type="hidden" name="order_id" value="{{ $filters['order_id'] }}">
            <input type="hidden" name="status" value="{{ $filters['status'] }}">
            <button class="button button-primary" type="submit" @disabled(! $canSync)>Đồng bộ toàn bộ khoảng ngày <span>↻</span></button>
            <a class="button button-outline" href="{{ route('tools.conversion-reports.export', $filters) }}">Xuất CSV <span>↓</span></a>
            <small>@if($canSync)Camlink tự lấy các trang tiếp theo; hoạt động trên web không trừ hạn mức API, tối đa {{ number_format(config('camlink.web_sync_max_pages') * 100) }} bản ghi mỗi lần @else Kết nối đang chọn cần cập nhật cookie trước khi đồng bộ @endif</small>
        </form>
    </section>

    @php($totalValue = (float) ($summary->total_value_internal ?? 0) / 100_000)
    @php($totalCommission = (float) ($summary->total_commission_internal ?? 0) / 100_000)
    <div class="report-summary-grid">
        <div class="report-summary-card"><small>BẢN GHI PHÙ HỢP</small><strong>{{ number_format((int) ($summary->total_records ?? 0)) }}</strong><span>Cập nhật gần nhất: {{ filled($summary->last_synced_at ?? null) ? \Carbon\Carbon::parse($summary->last_synced_at)->diffForHumans() : 'chưa đồng bộ' }}</span></div>
        <div class="report-summary-card"><small>TỔNG GIÁ TRỊ ĐƠN</small><strong>{{ number_format($totalValue, 0, ',', '.') }}đ</strong><span>trên toàn bộ kết quả đang lọc</span></div>
        <div class="report-summary-card"><small>TỔNG HOA HỒNG ƯỚC TÍNH</small><strong>{{ number_format($totalCommission, 0, ',', '.') }}đ</strong><span>trên toàn bộ kết quả đang lọc</span></div>
    </div>

    <section class="panel report-table-panel">
        <div class="panel-heading">
            <div><span class="panel-kicker">DANH SÁCH CHUYỂN ĐỔI</span><h2>{{ $records->total() ? 'Các đơn hàng đã ghi nhận' : 'Chưa có dữ liệu trong khoảng này' }}</h2></div>
            <small class="panel-hint">{{ $filters['start_date'] }} → {{ $filters['end_date'] }}</small>
        </div>
        @if($records->count())
            <div class="table-wrap">
                <table class="data-table report-table">
                    <thead><tr><th>Mã đơn</th><th>Thời gian</th><th>Nguồn</th><th>Giá trị đơn</th><th>Hoa hồng</th><th>Trạng thái</th><th></th></tr></thead>
                    <tbody>
                    @foreach($records as $record)
                        <tr>
                            <td><strong>{{ $record->checkout_id }}</strong><small>{{ $record->order_count }} đơn hàng con</small></td>
                            <td>{{ optional($record->purchase_time)->format('d/m/Y H:i') ?: '—' }}</td>
                            <td>{{ $record->source ?: 'Không xác định' }}</td>
                            <td><strong>{{ number_format((float) $record->order_value_internal / 100_000, 0, ',', '.') }}đ</strong></td>
                            <td>{{ number_format((float) $record->estimated_commission_internal / 100_000, 0, ',', '.') }}đ</td>
                            <td><span class="report-status report-status-{{ $record->conversion_status }}">{{ $statusLabels[$record->conversion_status] ?? 'Chưa phân loại' }}</span></td>
                            <td><details class="report-detail"><summary>Chi tiết</summary><pre>{{ json_encode($record->payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) }}</pre></details></td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
            @if($records->hasPages())
                <nav class="pagination-wrap" aria-label="Phân trang báo cáo">
                    @if($records->onFirstPage())<span>← Trang trước</span>@else<a href="{{ $records->previousPageUrl() }}">← Trang trước</a>@endif
                    <span>Trang {{ $records->currentPage() }} / {{ $records->lastPage() }}</span>
                    @if($records->hasMorePages())<a href="{{ $records->nextPageUrl() }}">Trang sau →</a>@else<span>Trang sau →</span>@endif
                </nav>
            @endif
        @else
            <div class="empty-state report-empty"><span>◌</span><strong>Chưa có bản ghi phù hợp</strong><p>Hãy đổi khoảng ngày hoặc bấm “Đồng bộ từ Shopee” để cập nhật dữ liệu mới.</p></div>
        @endif
    </section>
</div>
@endsection
