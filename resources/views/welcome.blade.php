@extends('layouts.app', ['title' => 'Camlink - Shopee Affiliate API'])

@section('content')
<section class="shell hero hero-home">
    <div class="hero-copy-col">
        <div class="eyebrow"><span class="eyebrow-dot"></span> Dành cho người làm Shopee Affiliate</div>
        <h1>Tạo link Affiliate.<br><span>Lấy báo cáo đơn hàng.</span></h1>
        <p class="hero-copy">Camlink cung cấp API để website, bot Telegram hoặc phần mềm của bạn tự tạo link Affiliate và lấy báo cáo chuyển đổi từ Shopee. Không cần làm lại từng thao tác bằng tay.</p>
        <div class="hero-actions"><a class="button button-primary button-large" href="{{ route('register') }}">Dùng thử miễn phí <span>↗</span></a><a class="button button-outline button-large" href="{{ route('docs') }}">Xem cách hoạt động <span>→</span></a></div>
        <div class="hero-proof"><span>✓ Kết nối tài khoản Shopee một lần</span><span>✓ API key riêng cho từng ứng dụng</span><span>✓ Theo dõi lượt dùng ngay trên dashboard</span></div>
    </div>
    <div class="hero-visual" aria-label="Minh hoạ request Camlink">
        <div class="visual-glow"></div>
        <div class="floating-chip chip-top"><span class="chip-icon chip-orange">↗</span><div><small>LINK CONVERTER</small><strong>Đã sẵn sàng</strong></div><i>●</i></div>
        <div class="api-console">
            <div class="console-head"><span class="window-dots"><i></i><i></i><i></i></span><span>camlink / request</span><span class="console-lock">⌁</span></div>
            <div class="console-body"><div class="code-line"><b class="code-method">POST</b><span>/api/v1/affiliate/convert-link</span></div><div class="code-line code-muted">Authorization: Bearer <em>clk_live_••••••</em></div><div class="code-divider"></div><div class="code-json"><span>{</span><span class="indent"><b>"original_links"</b>: [<em>"shopee.vn/product/..."</em>],</span><span class="indent"><b>"sub_id_1"</b>: <em>"facebook"</em></span><span>}</span></div><div class="console-result"><span class="result-check">✓</span><div><small>RESPONSE 200 · 420ms</small><strong>Link affiliate đã tạo</strong></div><span class="result-arrow">↗</span></div></div>
        </div>
        <div class="floating-chip chip-bottom"><span class="chip-icon chip-green">↺</span><div><small>CONVERSION REPORT</small><strong>1.248 bản ghi đã đồng bộ</strong></div></div>
    </div>
</section>

<section class="stats-strip"><div class="shell stats-grid"><div><strong>2</strong><span>API: tạo link và báo cáo đơn</span></div><div><strong>5</strong><span>Link Shopee mỗi request</span></div><div><strong>60</strong><span>Request mỗi phút / API key</span></div><div><strong>1 lần</strong><span>Kết nối tài khoản Shopee</span></div></div></section>

<section class="shell section-block" id="features">
    <div class="section-intro"><div><div class="eyebrow">Camlink dùng để làm gì?</div><h2>Hai API cho những việc bạn đang làm mỗi ngày.</h2></div><p>Phù hợp cho bot gửi link, website tổng hợp sản phẩm, hệ thống theo dõi đơn hoặc công cụ nội bộ của team Affiliate.</p></div>
    <div class="feature-grid feature-grid-new"><article class="feature-card feature-orange"><span class="feature-number">01</span><div class="feature-icon">↗</div><h3>Tạo link Affiliate</h3><p>Gửi link sản phẩm Shopee lên API và nhận lại link Affiliate. Mỗi request xử lý tối đa 5 link, có hỗ trợ Sub ID để phân biệt nguồn traffic.</p><a href="{{ route('docs') }}#convert-link">Xem cách gọi API <span>→</span></a></article><article class="feature-card feature-dark"><span class="feature-number">02</span><div class="feature-icon">◌</div><h3>Lấy báo cáo đơn hàng</h3><p>Lấy danh sách đơn phát sinh theo ngày, mã đơn và trạng thái. Camlink lưu lại dữ liệu để bạn dễ kiểm tra và đối soát.</p><a href="{{ route('docs') }}#conversion-reports">Xem dữ liệu trả về <span>→</span></a></article><article class="feature-card feature-cream"><span class="feature-number">03</span><div class="feature-icon">⌁</div><h3>Quản lý kết nối</h3><p>Thêm tài khoản Shopee bằng file cookie, tạo API key cho từng ứng dụng và xem hạn mức đã dùng trong cùng một dashboard.</p><a href="{{ route('home') }}#security">Xem cách bảo vệ dữ liệu <span>→</span></a></article></div>
</section>

<section class="shell section-block workflow-section"><div class="section-intro"><div><div class="eyebrow">Bắt đầu trong ba bước</div><h2>Từ tài khoản Shopee đến request đầu tiên.</h2></div><p>Đăng ký, tải file cookie và tạo API key. Sau đó bạn có thể gọi API từ bất kỳ backend nào.</p></div><div class="workflow-grid"><div class="workflow-step"><span>1</span><h3>Tạo tài khoản Camlink</h3><p>Đăng ký bằng email. Hệ thống tự tạo workspace và hạn mức Starter cho bạn.</p></div><div class="workflow-line"></div><div class="workflow-step"><span>2</span><h3>Tải cookie Shopee lên</h3><p>Camlink kiểm tra phiên đăng nhập, lọc cookie cần thiết rồi mã hoá trước khi lưu.</p></div><div class="workflow-line"></div><div class="workflow-step"><span>3</span><h3>Tạo API key</h3><p>Dùng key trong website, bot hoặc phần mềm của bạn để gọi hai API Shopee Affiliate.</p></div></div></section>

<section class="shell code-section" id="security"><div class="code-section-copy"><div class="eyebrow">Dễ tích hợp vào hệ thống có sẵn</div><h2>Gửi request.<br>Nhận link Affiliate.</h2><p>API trả JSON rõ ràng, có mã lỗi và request ID để kiểm tra khi có sự cố. Cookie Shopee không xuất hiện trong response hoặc dashboard.</p><a class="text-link" href="{{ route('docs') }}">Đọc tài liệu đầy đủ <span>↗</span></a></div><div class="code-card"><div class="code-card-head"><span>curl</span><span class="code-live">● live</span></div><pre><span class="code-pink">curl</span> -X POST https://your-domain.com/api/v1/affiliate/convert-link &#92;
  -H <span class="code-yellow">'Authorization: Bearer clk_live_...'</span> &#92;
  -H <span class="code-yellow">'Content-Type: application/json'</span> &#92;
  -d <span class="code-green">'{"original_links":["https://shopee.vn/..."]}'</span></pre></div></section>

<section class="shell cta-section"><div><div class="eyebrow">Sẵn sàng dùng thử</div><h2>Tạo link Affiliate đầu tiên.</h2><p>Đăng ký tài khoản, kết nối Shopee và tạo API key. Sau đó bạn có thể gọi Convert Link từ website, bot hoặc phần mềm của mình.</p></div><a class="button button-light button-large" href="{{ route('register') }}">Tạo tài khoản miễn phí <span>↗</span></a></section>
@endsection
