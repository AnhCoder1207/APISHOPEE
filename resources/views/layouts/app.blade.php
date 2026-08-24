<!doctype html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="description" content="Camlink cung cấp API để tự động tạo link Affiliate và lấy báo cáo đơn hàng Shopee.">
    <meta name="theme-color" content="#f25b3f">
    <meta property="og:title" content="Camlink - Shopee Affiliate API">
    <meta property="og:description" content="Tạo link Affiliate và lấy báo cáo đơn hàng Shopee từ website, bot hoặc phần mềm của bạn.">
    <meta property="og:type" content="website">
    <title>{{ $title ?? 'Camlink - Shopee Affiliate API' }}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/camlink.css">
</head>
<body class="site-body">
<div class="top-note"><div class="shell top-note-inner"><span class="live-dot"></span> API tạo link Affiliate và lấy báo cáo đơn hàng Shopee <a href="{{ route('docs') }}">Xem cách dùng →</a></div></div>
<header class="shell topbar">
    <a class="brand" href="{{ route('home') }}" aria-label="Camlink trang chủ"><span class="brand-mark">C</span><span>camlink</span><small>SHOPEE API</small></a>
    <nav class="nav" aria-label="Điều hướng chính">
        <a class="nav-link" href="{{ route('home') }}#features">Tính năng</a>
        <a class="nav-link" href="{{ route('docs') }}">Tài liệu</a>
        @auth
            <a class="nav-link" href="{{ route('dashboard') }}">Bảng điều khiển</a>
            @if(auth()->user()->is_admin)<a class="nav-link" href="{{ route('admin.index') }}">Quản trị</a>@endif
            <form method="post" action="{{ route('logout') }}" class="nav-form">@csrf<button class="button button-quiet" type="submit">Đăng xuất</button></form>
        @else
            <a class="nav-link" href="{{ route('login') }}">Đăng nhập</a>
            <a class="button button-primary button-small" href="{{ route('register') }}">Bắt đầu miễn phí <span>↗</span></a>
        @endauth
    </nav>
</header>
<main>@yield('content')</main>
<footer class="site-footer"><div class="shell footer-inner"><div><a class="brand brand-footer" href="{{ route('home') }}"><span class="brand-mark">C</span><span>camlink</span></a><p>API dành cho website, bot và công cụ Shopee Affiliate của bạn.</p></div><div class="footer-links"><a href="{{ route('docs') }}">Tài liệu API</a><a href="{{ route('home') }}#features">Tính năng</a><a href="{{ route('home') }}#security">Bảo mật</a><a href="{{ route('legal.terms') }}">Điều khoản</a><a href="{{ route('legal.privacy') }}">Quyền riêng tư</a></div><small>© {{ date('Y') }} Camlink. Tích hợp Shopee không chính thức.</small></div></footer>
@stack('scripts')
</body>
</html>
