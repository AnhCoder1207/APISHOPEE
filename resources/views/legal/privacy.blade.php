@extends('layouts.app', ['title' => 'Quyền riêng tư - Camlink'])

@section('content')
<div class="shell docs-shell legal-shell">
    <div class="eyebrow"><span class="eyebrow-dot"></span> Quyền riêng tư</div>
    <h1>Dữ liệu của bạn<br><span>được giữ kín.</span></h1>
    <p class="legal-lead">Camlink chỉ lưu những gì cần thiết để vận hành workspace, API và lịch sử báo cáo. Chúng tôi không bán dữ liệu hoặc cookie cho bên thứ ba.</p>
    <article class="panel legal-content">
        <h2>Thông tin được lưu</h2>
        <p>Tài khoản lưu tên, email, mật khẩu đã băm và trạng thái workspace. Cookie Shopee được lọc về header cần thiết rồi mã hoá bằng <code>APP_KEY</code> trước khi lưu; file JSON gốc không được giữ lại.</p>
        <h2>Dữ liệu API và hoạt động web</h2>
        <p>API key chỉ lưu dạng hash. Camlink lưu request ID, thời gian, trạng thái và số units để đối soát quota. Các thao tác trên web có ghi nhận audit với <code>billable=false</code>, nên không làm giảm hạn mức API.</p>
        <h2>Nhà cung cấp bên ngoài</h2>
        <p>Khi bạn yêu cầu tạo link hoặc đồng bộ báo cáo, cookie đã mã hoá được giải mã trong bộ nhớ để gửi request tới affiliate.shopee.vn. Cookie không được ghi vào log.</p>
        <h2>Lưu trữ và xoá dữ liệu</h2>
        <p>Bạn có thể xoá kết nối Shopee hoặc yêu cầu xoá workspace. Dữ liệu backup và log vận hành (nếu có) sẽ được dọn theo chính sách lưu trữ của hệ thống.</p>
        <h2>Bảo mật</h2>
        <p>Hãy bật HTTPS, đặt <code>APP_DEBUG=false</code>, giữ bí mật <code>APP_KEY</code> và không đưa API key/cookie vào mã nguồn, issue hoặc log.</p>
    </article>
</div>
@endsection
