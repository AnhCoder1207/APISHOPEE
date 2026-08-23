# CamLink Affiliate SaaS

Ứng dụng nhiều người dùng cho Shopee Affiliate, dùng Supabase PostgreSQL và có thể chạy bằng Node.js, Docker hoặc Cloudflare Workers.

## Tính năng

- Đăng ký, đăng nhập và session cookie bảo mật.
- Workspace tách biệt dữ liệu giữa người dùng.
- Nhập cookie Shopee bằng file JSON xuất từ J2TEAM Cookies; chỉ header đã lọc được mã hóa AES-GCM trước khi lưu.
- Tạo tối đa 5 link affiliate mỗi lượt, hỗ trợ Sub ID 1-5.
- Báo cáo chuyển đổi, đồng bộ dữ liệu và xuất CSV.
- API key có thể thu hồi cho bot hoặc hệ thống bên ngoài.
- Quota theo tháng, audit usage và rate limit đăng nhập.
- Frontend Vite + React, API Hono, giao diện responsive cho desktop và mobile.

## Cài đặt

Yêu cầu Node.js 22 trở lên.

```bash
npm install
npm run typecheck
```

Sao chép `.dev.vars.example` thành `.dev.vars`, sau đó cấu hình:

```txt
DATABASE_URL=postgresql://...
COOKIE_ENCRYPTION_KEY=chuoi-ngau-nhien-toi-thieu-32-ky-tu
APP_URL=http://localhost:8787
TRUST_PROXY=false
```

Không commit `.dev.vars` hoặc `.env.production`.

## Database

Chạy migration:

```bash
npm run db:migrate
```

Các bảng được tạo trong schema riêng `camlink`, không nằm trong schema `public` được Supabase Data API tự động công khai.

Nếu endpoint trực tiếp `db.<project>.supabase.co` không truy cập được do chỉ có IPv6, dùng Supabase Session Pooler:

```txt
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

## Chạy local

```bash
npm run dev
```

Lệnh này chạy API Hono tại `http://localhost:8787` và Vite tại `http://localhost:5173`. Mở `http://localhost:5173` để dùng giao diện; Vite proxy toàn bộ `/api` sang API local.

Build production local:

```bash
npm run build
npm start
```

Build tạo frontend tại `dist/web` và server Node tại `dist/server.js`. Khi chạy `npm start`, server phục vụ cả hai tại `http://localhost:8787`.

Worker local vẫn có thể chạy riêng bằng `npm run dev:worker`, nhưng không bắt buộc nếu bạn triển khai trên máy chủ Node.js.

## API cho khách hàng

Tạo API key trong màn hình **API key**, sau đó gửi:

```http
POST /api/v1/affiliate/convert-link
Authorization: Bearer clk_live_...
Content-Type: application/json

{
  "originalLinks": ["https://shopee.vn/product/..."],
  "subId1": "facebook_reels"
}
```

## Quản trị hệ thống

Sau khi chạy migration, cấp quyền system admin cho một tài khoản đã đăng ký:

```bash
npm run admin:grant -- admin@example.com
```

Nếu database chỉ có đúng một tài khoản, có thể bỏ email:

```bash
npm run admin:grant
```

Đăng nhập lại và mở mục **Quản trị hệ thống**. Admin có thể quản lý người dùng, workspace, gói/quota, phiên đăng nhập, API key, trạng thái kết nối Shopee và xem audit log. Không có endpoint công khai để người dùng tự nâng quyền admin.

Gỡ quyền bằng `npm run admin:revoke -- admin@example.com`. Hệ thống không cho gỡ admin cuối cùng đang hoạt động.

Báo cáo chuyển đổi:

```http
POST /api/v1/affiliate/conversion-reports
Authorization: Bearer clk_live_...
Content-Type: application/json

{
  "startDate": "2026-08-17",
  "endDate": "2026-08-23",
  "limit": 100,
  "page": 1
}
```

## Chạy production bằng Node.js

Tạo `.env.production` từ `.env.production.example`, sau đó đặt ít nhất các biến sau:

```txt
NODE_ENV=production
APP_URL=https://ten-mien-cua-ban
DATABASE_URL=postgresql://...
COOKIE_ENCRYPTION_KEY=chuoi-ngau-nhien-toi-thieu-32-ky-tu
TRUST_PROXY=true
```

Build và chạy:

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

## Triển khai nền tảng khác

Frontend là thư mục tĩnh sau build (`dist/web`), còn API là Node server (`dist/server.js`). Có thể phục vụ chung bằng Docker hoặc tách frontend tĩnh và API tùy nền tảng. Luôn cấu hình các biến `SHOPEE_BASE_API`, `DATABASE_URL`, `COOKIE_ENCRYPTION_KEY`, `SESSION_COOKIE_NAME`, `APP_URL` và `SERVER_URL`; endpoint health check là `/api/health`.

Production phải đặt sau HTTPS vì session cookie có cờ `Secure`. Chỉ đặt `TRUST_PROXY=true` khi ứng dụng nằm sau reverse proxy đáng tin cậy có quản lý `X-Forwarded-For`.

## Chạy bằng Docker

```bash
docker build -t camlink .
docker run --env-file .env.production -p 8787:8787 camlink
```

File môi trường không được đưa vào Docker image. Có thể dùng cùng image này trên Railway, Render, Fly.io, VPS hoặc nền tảng hỗ trợ container khác.

## Cloudflare Workers (tùy chọn)

Nếu sau này cần dùng Cloudflare:

```bash
npx wrangler login
npm run deploy:cloudflare
```

Nên cấu hình custom domain, sau đó thêm `APP_URL=https://ten-mien-cua-ban` vào `.env.production` và deploy lại.

## Lưu ý vận hành

- Đây là tích hợp không chính thức; Shopee có thể thay đổi endpoint hoặc cơ chế cookie.
- Người dùng lấy cookie bằng extension J2TEAM Cookies tại `affiliate.shopee.vn`, xuất file JSON, sau đó vào **Tài khoản Shopee → Thêm tài khoản Shopee** để tải file lên. CamLink không lưu file JSON gốc và không trả cookie về frontend.
- Không ghi cookie, API key hoặc database URL vào log.
- Đổi ngay database password nếu nó từng xuất hiện trong chat, ảnh chụp hoặc terminal history.
- Mỗi tiến trình hiện dùng tối đa một kết nối PostgreSQL; khi scale ngang cần theo dõi giới hạn kết nối của Supabase Pooler.
- Sao lưu database và giám sát `/api/health`, lỗi ứng dụng, tỷ lệ 429/5xx trước khi mở cho người dùng thật.
