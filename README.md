# Camlink Laravel

Camlink là SaaS API không chính thức cho Shopee Affiliate. Phiên bản Laravel này cung cấp:

- Đăng ký, đăng nhập và workspace tách biệt dữ liệu.
- Kết nối cookie Shopee bằng JSON export; chỉ header đã lọc được mã hóa khi lưu.
- Convert tối đa 5 link affiliate trong một request, hỗ trợ Sub ID 1-5.
- Conversion Reports theo ngày, trạng thái, mã đơn và phân trang.
- API key dạng `clk_live_...`, hash-only, thu hồi và ngày hết hạn.
- Quota theo tháng, rate limit theo API key, usage events và request ID.
- Dashboard người dùng, API docs và console admin.
- Hai công cụ web: tạo link Affiliate và xem/đồng bộ Conversion Reports; thao tác web không trừ quota API.
- Đồng bộ báo cáo web tự lấy nhiều trang (giới hạn bởi `WEB_SYNC_MAX_PAGES`) và lưu lịch sử thao tác không tính phí.
- Có thể cập nhật cookie cho kết nối cũ khi phiên Shopee hết hạn.

## Yêu cầu

- PHP 8.3+
- Composer 2+
- MySQL 8 / MariaDB 10.4+ (khuyến nghị dùng MySQL cho production)
- Redis tùy chọn cho cache/queue khi scale

## Chạy local

~~~powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
mysql -u root -e "CREATE DATABASE camlink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
php artisan migrate
php artisan serve
~~~

Nếu Composer/PHP chưa có trong PATH, chạy các lệnh bằng đường dẫn PHP 8.3+ tương ứng.

Mở:

- Dashboard: `http://127.0.0.1:8000`
- API docs: `/docs`
- OpenAPI JSON: `/openapi.json`
- Health: `/api/health`

## Luồng sử dụng

1. Đăng ký tài khoản.
2. Vào Dashboard, xuất cookie JSON từ extension J2TEAM Cookies tại `affiliate.shopee.vn`.
3. Thêm kết nối Shopee. Camlink không lưu file JSON gốc và không trả cookie về frontend.
4. Tạo API key và chỉ lưu key trong secret manager.
5. Gọi API:

~~~http
POST /api/v1/affiliate/convert-link
Authorization: Bearer clk_live_...
Content-Type: application/json
~~~

~~~json
{
  "original_links": ["https://shopee.vn/product/123/456"],
  "sub_id_1": "facebook"
}
~~~

Báo cáo:

~~~http
POST /api/v1/affiliate/conversion-reports
Authorization: Bearer clk_live_...
Content-Type: application/json
~~~

~~~json
{
  "start_date": "2026-08-01",
  "end_date": "2026-08-24",
  "limit": 100,
  "page": 1,
  "status": 2
}
~~~

## Admin

Sau khi một tài khoản đã đăng ký:

~~~powershell
php artisan camlink:make-admin admin@example.com
~~~

Sau đó đăng nhập và mở `/admin`. Admin có thể xem user/workspace, khóa user và điều chỉnh quota; mọi thay đổi được ghi audit log.

## Kiểm tra

~~~powershell
php artisan test
php artisan route:list
~~~

## Biến môi trường quan trọng

- `SHOPEE_BASE_API`: mặc định `https://affiliate.shopee.vn/api/v3`
- `SHOPEE_TIMEOUT`: timeout upstream, mặc định 20 giây
- `WEB_SYNC_MAX_PAGES`: số trang tối đa cho một lần đồng bộ báo cáo trên web, mặc định 25 (2.500 bản ghi)
- `API_RATE_LIMIT`: số request/phút/API key, mặc định 60
- `STARTER_MONTHLY_QUOTA`: quota mặc định workspace Starter, mặc định 2000
- `API_KEY_PREFIX`: mặc định `clk_live_`

## Production checklist nhanh

1. Dùng PHP 8.3+ có `pdo_mysql`, Composer 2 và MySQL/MariaDB.
2. Đặt `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL` là domain HTTPS thật và giữ bí mật `APP_KEY`.
3. Cấu hình mail thật (`MAIL_MAILER`, `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`) để dùng reset mật khẩu.
4. Chạy `php artisan migrate --force`, `php artisan optimize`, sau đó trỏ web server vào thư mục `public`.
5. Chạy worker nếu dùng queue: `php artisan queue:work --tries=3`.
6. Dùng `/api/health` cho liveness và `/api/health/ready` cho readiness; không ghi cookie Shopee hoặc API key vào log.
7. Chạy `php artisan camlink:production-check` trước khi chuyển traffic thật.

Các công cụ web nằm tại `/tools/convert-link` và `/tools/conversion-reports`. Web activity được lưu với `billable=false` để audit nhưng không làm giảm quota; API vẫn tính quota theo API key như trước.

Mẫu Nginx và Supervisor nằm trong `deploy/`. File `.env.production.example` liệt kê các biến cần thiết cho server.

Đây là tích hợp unofficial; Shopee có thể đổi endpoint hoặc cơ chế cookie. Không ghi cookie, API key hay payload nhạy cảm vào log.
