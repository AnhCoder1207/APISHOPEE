@extends('layouts.app', ['title' => 'Tạo link Affiliate - Camlink'])

@section('content')
<div class="shell tools-shell">
    <section class="tool-hero">
        <div>
            <div class="eyebrow"><span class="eyebrow-dot"></span> Công cụ trên web</div>
            <h1>Tạo link<br><span>Affiliate.</span></h1>
            <p>Dán link sản phẩm Shopee, chọn tài khoản kết nối và nhận link Affiliate ngay trên Camlink. Luồng này không trừ hạn mức API.</p>
        </div>
        <div class="tool-hero-side"><span class="tool-hero-icon">↗</span><strong>Tối đa 5 link mỗi lần</strong><small>Kết quả được lưu để bạn xem lại trong workspace.</small></div>
    </section>

    @if(session('status'))<div class="notice"><span>✓</span>{{ session('status') }}</div>@endif
    @if($errors->any())<div class="error-list"><ul>@foreach($errors->all() as $error)<li>{{ $error }}</li>@endforeach</ul></div>@endif
    @php($readyConnections = $connections->where('status', 'connected'))
    @if($readyConnections->isEmpty())<div class="tool-prerequisite"><span>S</span><div><strong>Chưa có kết nối Shopee đang dùng được</strong><p>Hãy thêm cookie mới hoặc cập nhật kết nối đang hết phiên trước khi tạo link.</p></div><a class="button button-primary button-small" href="{{ route('dashboard') }}">Quản lý kết nối →</a></div>@endif

    <div class="tool-layout">
        <section class="panel tool-form-panel">
            <div class="panel-heading"><div><span class="panel-kicker">CONVERT LINK</span><h2>Nhập link Shopee</h2></div><span class="count-badge">WEB</span></div>
            <p class="panel-copy">Mỗi dòng là một link sản phẩm. Camlink sẽ giữ nguyên link gốc và trả về link Affiliate tương ứng.</p>
            <form method="post" action="{{ route('tools.convert-link.store') }}">
                @csrf
                <div class="field"><label for="connection_id">Tài khoản Shopee sử dụng</label><select id="connection_id" name="connection_id" required @disabled($readyConnections->isEmpty())><option value="">{{ $readyConnections->isEmpty() ? 'Chưa có kết nối đang sẵn sàng' : 'Chọn tài khoản kết nối' }}</option>@foreach($connections as $connection)<option value="{{ $connection->id }}" @disabled($connection->status !== 'connected') @selected(old('connection_id', $readyConnections->firstWhere('is_default', true)?->id ?? $readyConnections->first()?->id) == $connection->id)>{{ $connection->name }}{{ $connection->is_default ? ' · Mặc định' : '' }}{{ $connection->status !== 'connected' ? ' · Cần cập nhật cookie' : '' }}</option>@endforeach</select></div>
                <div class="link-inputs">
                    @for($index = 0; $index < 5; $index++)
                        <div class="link-input-row"><span>{{ $index + 1 }}</span><input name="original_links[]" type="url" value="{{ old('original_links.'.$index) }}" placeholder="https://shopee.vn/product/..." @required($index === 0)></div>
                    @endfor
                </div>
                <div class="subid-box"><div class="subid-heading"><strong>Gắn mã theo dõi <small>(không bắt buộc)</small></strong><span>Sub ID</span></div><p>Dùng Sub ID để biết link đến từ kênh nào, ví dụ: Facebook, Telegram hoặc TikTok.</p><div class="subid-grid">@for($index = 1; $index <= 5; $index++)<div class="field"><label for="sub_id_{{ $index }}">Sub ID {{ $index }}</label><input id="sub_id_{{ $index }}" name="sub_id_{{ $index }}" value="{{ old('sub_id_'.$index) }}" placeholder="vi_du_{{ $index }}"></div>@endfor</div></div>
                <button class="button button-primary button-full button-large" type="submit" @disabled($readyConnections->isEmpty())>Tạo link Affiliate <span>↗</span></button>
                <p class="tool-form-note">Không tính vào quota API · Tối đa 5 link · Chỉ nhận URL HTTPS của Shopee</p>
            </form>
        </section>
        <aside class="panel tool-guide"><span class="panel-kicker">CÁCH DÙNG</span><h2>Ba bước là xong.</h2><div class="guide-steps"><div><span>1</span><p><strong>Chọn kết nối</strong><small>Camlink dùng phiên Shopee bạn đã lưu.</small></p></div><div><span>2</span><p><strong>Dán link sản phẩm</strong><small>Mỗi dòng một link, tối đa 5 link.</small></p></div><div><span>3</span><p><strong>Chép link Affiliate</strong><small>Dùng ngay cho bot, website hoặc bài đăng.</small></p></div></div><div class="tool-callout"><span>⌁</span><p>Camlink lưu hoạt động để bạn xem lại, nhưng không trừ hạn mức API của workspace.</p></div></aside>
    </div>

    @if(session('convert_result'))
        <section class="panel tool-result-panel"><div class="panel-heading"><div><span class="panel-kicker">KẾT QUẢ VỪA TẠO</span><h2>Link Affiliate của bạn</h2></div><small class="panel-hint">{{ session('convert_result.connection_name') }}</small></div><div class="result-list">@foreach(session('convert_result.items', []) as $item)<div class="result-row"><div class="result-original"><small>Link gốc</small><span title="{{ $item['original_link'] }}">{{ $item['original_link'] }}</span></div><div class="result-affiliate">@if($item['short_link'])<small>Link Affiliate</small><a href="{{ $item['short_link'] }}" target="_blank" rel="noreferrer">{{ $item['short_link'] }}</a><button type="button" class="copy-link" data-copy-link="{{ $item['short_link'] }}">Chép link</button>@else<strong class="result-failed">Chưa tạo được link (mã {{ $item['fail_code'] }})</strong>@endif</div></div>@endforeach</div></section>
    @endif

    <section class="panel recent-panel"><div class="panel-heading"><div><span class="panel-kicker">LỊCH SỬ GẦN ĐÂY</span><h2>Các lần tạo link trước</h2></div><a class="text-link" href="{{ route('dashboard') }}">Về bảng điều khiển →</a></div>@forelse($recentBatches as $batch)<details class="history-detail"><summary class="history-row"><span><strong>{{ $batch->item_count }} link</strong><small>{{ $batch->created_at->format('d/m/Y H:i') }}</small></span><span>{{ $batch->results->whereNotNull('short_link')->count() }} link đã tạo thành công</span></summary><div class="result-list history-results">@foreach($batch->results as $item)<div class="result-row"><div class="result-original"><small>Link gốc</small><span title="{{ $item->original_link }}">{{ $item->original_link }}</span></div><div class="result-affiliate">@if($item->short_link)<small>Link Affiliate</small><a href="{{ $item->short_link }}" target="_blank" rel="noreferrer">{{ $item->short_link }}</a><button type="button" class="copy-link" data-copy-link="{{ $item->short_link }}">Chép link</button>@else<strong class="result-failed">Chưa tạo được link (mã {{ $item->fail_code }})</strong>@endif</div></div>@endforeach</div></details>@empty<div class="empty-state"><span>↗</span><strong>Chưa có lịch sử tạo link</strong><p>Kết quả bạn tạo trên web sẽ xuất hiện ở đây.</p></div>@endforelse</section>
</div>
@push('scripts')
<script>
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
document.querySelectorAll('[data-copy-link]').forEach((button) => button.addEventListener('click', async () => {
    const copied = await copyText(button.dataset.copyLink);
    button.textContent = copied ? 'Đã chép' : 'Không thể chép';
    setTimeout(() => button.textContent = 'Chép link', 1600);
}));
</script>
@endpush
@endsection
