<?php

namespace App\Http\Controllers\Web;

use App\Http\Requests\ConversionReportRequest;
use App\Models\ConversionRecord;
use App\Models\LinkBatch;
use App\Models\ShopeeConnection;
use App\Services\AffiliateDataService;
use App\Services\Shopee\ShopeeAffiliateClient;
use App\Services\UsageService;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AffiliateToolsController
{
    public function convertLink(Request $request): View|RedirectResponse
    {
        $workspace = $request->user()->currentWorkspace();

        if ($request->isMethod('post')) {
            $request->merge([
                'original_links' => collect($request->input('original_links', []))
                    ->filter(fn ($link) => filled($link))
                    ->map(fn ($link) => trim((string) $link))
                    ->values()
                    ->all(),
            ]);
            $input = $request->validate([
                'connection_id' => ['nullable', 'integer', 'min:1'],
                'original_links' => ['required', 'array', 'min:1', 'max:5'],
                'original_links.*' => ['required', 'string', 'url', 'max:2048'],
                'sub_id_1' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
                'sub_id_2' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
                'sub_id_3' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
                'sub_id_4' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
                'sub_id_5' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
            ], [
                'original_links.required' => 'Hãy dán ít nhất một link Shopee để Camlink xử lý.',
                'original_links.*.url' => 'Link này chưa đúng định dạng URL.',
            ]);

            try {
                $client = app(ShopeeAffiliateClient::class);
                $client->validateLinks($input['original_links']);
                $connection = $this->connection($workspace, $input['connection_id'] ?? null);
                $response = $client->convertLinks($connection->encrypted_cookie, $input);

                if ($client->isAuthError($response)) {
                    $this->mark($connection, 'expired', 'SHOPEE_SESSION_EXPIRED');
                    throw new ApiException('SHOPEE_SESSION_EXPIRED', 'Shopee không chấp nhận phiên đăng nhập đang lưu. Hãy đăng nhập lại affiliate.shopee.vn, xuất file cookie mới rồi cập nhật kết nối trên Camlink.', 422);
                }
                if ($response->failed()) {
                    $this->markFailure($connection, 'SHOPEE_UPSTREAM_ERROR', $response->json('is_login') === true);
                    throw new ApiException('SHOPEE_UPSTREAM_ERROR', $client->upstreamErrorMessage($response), 502);
                }

                $payload = $client->payload($response, 'data.batchCustomLink');

                $items = data_get($payload, 'data.batchCustomLink', []);
                $items = is_array($items) ? $items : [];
                $batch = app(AffiliateDataService::class)->persistLinks($workspace, $request->user(), $connection, $input, $items);
                $this->mark($connection, 'connected');
                app(UsageService::class)->record($request->user(), $workspace, 'web_convert_link', $response->status(), count($input['original_links']), null, false, null, ['connection_id' => $connection->id, 'batch_id' => $batch->id]);

                return redirect()->route('tools.convert-link')->with('convert_result', [
                    'connection_name' => $connection->name,
                    'items' => $batch->results()->get()->toArray(),
                ])->with('status', 'Đã tạo link Affiliate. Kết quả không tính vào hạn mức API.');
            } catch (InvalidArgumentException $exception) {
                return back()->withErrors(['original_links' => $exception->getMessage()])->withInput();
            } catch (ApiException $exception) {
                if (isset($connection)) {
                    $this->markFailure($connection, $exception->errorCode, isset($response) && $response->json('is_login') === true);
                    app(UsageService::class)->record($request->user(), $workspace, 'web_convert_link', $exception->status, count($input['original_links'] ?? []), null, false, null, ['connection_id' => $connection->id, 'error_code' => $exception->errorCode]);
                }

                return back()->withErrors(['tool' => $exception->getMessage()])->withInput();
            } catch (\Throwable $exception) {
                report($exception);

                return back()->withErrors(['tool' => 'Camlink chưa nhận được phản hồi ổn định từ Shopee. File kết nối vẫn được giữ nguyên; bạn có thể thử lại sau ít phút.'])->withInput();
            }
        }

        return view('tools.convert-link', [
            'workspace' => $workspace,
            'connections' => $workspace->connections()->whereNull('deleted_at')->latest()->get(),
            'recentBatches' => LinkBatch::query()
                ->with('results')
                ->where('workspace_id', $workspace->id)
                ->latest()
                ->limit(5)
                ->get(),
        ]);
    }

    public function reports(Request $request): View
    {
        $workspace = $request->user()->currentWorkspace();
        $filters = $this->reportFilters($request);
        $records = $this->reportQuery($workspace->id, $filters)
            ->latest('purchase_time')
            ->paginate(20)
            ->withQueryString();

        $summary = $this->reportQuery($workspace->id, $filters)
            ->selectRaw('COUNT(*) as total_records, COALESCE(SUM(order_value_internal), 0) as total_value_internal, COALESCE(SUM(estimated_commission_internal), 0) as total_commission_internal, MAX(last_synced_at) as last_synced_at')
            ->first();

        return view('tools.conversion-reports', [
            'workspace' => $workspace,
            'connections' => $workspace->connections()->whereNull('deleted_at')->latest()->get(),
            'records' => $records,
            'filters' => $filters,
            'statusLabels' => $this->statusLabels(),
            'summary' => $summary,
        ]);
    }

    public function exportReports(Request $request): StreamedResponse
    {
        $workspace = $request->user()->currentWorkspace();
        $filters = $this->reportFilters($request);
        $records = $this->reportQuery($workspace->id, $filters)->oldest('purchase_time');
        $filename = "camlink-conversions-{$filters['start_date']}-{$filters['end_date']}.csv";

        return response()->streamDownload(function () use ($records) {
            $output = fopen('php://output', 'wb');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['Checkout ID', 'Ngày mua', 'Nguồn / Sub ID', 'Số đơn', 'Giá trị đơn', 'Hoa hồng dự kiến', 'Trạng thái'], ',', '"', '');
            foreach ($records->cursor() as $record) {
                fputcsv($output, [
                    $this->csvCell($record->checkout_id),
                    optional($record->purchase_time)->format('d/m/Y H:i') ?: '',
                    $this->csvCell($record->source),
                    $record->order_count,
                    (string) ((float) $record->order_value_internal / 100_000),
                    (string) ((float) $record->estimated_commission_internal / 100_000),
                    $this->statusLabels()[$record->conversion_status] ?? 'Chưa phân loại',
                ], ',', '"', '');
            }
            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function syncReports(ConversionReportRequest $request): RedirectResponse
    {
        $workspace = $request->user()->currentWorkspace();
        $input = $request->validated();
        $input['limit'] = 100;
        $input['page'] = 1;

        try {
            $client = app(ShopeeAffiliateClient::class);
            $connection = $this->connection($workspace, $input['connection_id'] ?? null);
            $synced = 0;
            $pages = 0;
            $hasMore = false;
            $maxPages = max(1, (int) config('camlink.web_sync_max_pages', 25));

            do {
                $response = $client->conversionReports($connection->encrypted_cookie, $input);
                $payload = $client->payload($response, 'data.list', true);
                $entries = data_get($payload, 'data.list', []);
                $synced += app(AffiliateDataService::class)->persistReports($workspace, $connection, $payload);
                $pages++;

                $total = max(0, (int) data_get($payload, 'data.total_count', 0));
                $hasMore = $total > 0
                    ? $total > $input['page'] * $input['limit']
                    : count($entries) === $input['limit'];
                $input['page']++;
            } while ($hasMore && $pages < $maxPages);

            $this->mark($connection, 'connected');
            app(UsageService::class)->record($request->user(), $workspace, 'web_conversion_sync', 200, max(1, $pages), null, false, null, [
                'connection_id' => $connection->id,
                'synced_records' => $synced,
                'pages' => $pages,
                'has_more' => $hasMore,
            ]);

            $message = $pages === 1
                ? "Đã đồng bộ {$synced} bản ghi. Lần đồng bộ trên web không tính vào hạn mức API."
                : "Đã cập nhật {$synced} bản ghi từ {$pages} trang Shopee. Thao tác này không trừ hạn mức API.";
            if ($hasMore) {
                $message .= ' Khoảng ngày có nhiều dữ liệu; hãy chia nhỏ khoảng ngày để lấy phần còn lại.';
            }

            return redirect()->route('tools.conversion-reports', [
                'start_date' => $input['start_date'],
                'end_date' => $input['end_date'],
                'connection_id' => $connection->id,
                'status' => $input['status'] ?? null,
                'order_id' => $input['order_id'] ?? null,
            ])->with('status', $message);
        } catch (ApiException $exception) {
            if (isset($connection)) {
                $this->mark($connection, $exception->errorCode === 'SHOPEE_SESSION_EXPIRED' ? 'expired' : 'error', $exception->errorCode);
                app(UsageService::class)->record($request->user(), $workspace, 'web_conversion_sync', $exception->status, 1, null, false, null, ['connection_id' => $connection->id, 'error_code' => $exception->errorCode]);
            }

            return back()->withErrors(['report' => $exception->getMessage()])->withInput();
        } catch (\Throwable $exception) {
            report($exception);

            return back()->withErrors(['report' => 'Camlink chưa nhận được báo cáo ổn định từ Shopee. Vui lòng thử lại sau ít phút.'])->withInput();
        }
    }

    private function connection($workspace, ?int $connectionId): ShopeeConnection
    {
        $query = $workspace->connections()->whereNull('deleted_at');
        $connection = $connectionId
            ? $query->whereKey($connectionId)->first()
            : $query->orderByRaw("case when status = 'connected' then 0 else 1 end")
                ->orderByDesc('is_default')
                ->orderBy('created_at')
                ->first();

        if (! $connection) {
            throw new ApiException('SHOPEE_CONNECTION_NOT_FOUND', 'Bạn chưa có kết nối Shopee. Hãy thêm một file cookie trong bảng điều khiển trước.', 404);
        }
        if ($connection->status !== 'connected') {
            throw new ApiException('SHOPEE_CONNECTION_NOT_READY', "Kết nối {$connection->name} cần được cập nhật hoặc kiểm tra lại trước khi sử dụng.", 422);
        }

        return $connection;
    }

    private function mark(ShopeeConnection $connection, string $status, ?string $error = null): void
    {
        $connection->forceFill(['status' => $status, 'last_error_code' => $error, 'last_checked_at' => now()])->save();
    }

    private function markFailure(ShopeeConnection $connection, string $error, bool $keepReady = false): void
    {
        if ($error === 'SHOPEE_SESSION_EXPIRED') {
            $this->mark($connection, 'expired', $error);

            return;
        }

        if ($keepReady) {
            $connection->forceFill(['last_error_code' => $error, 'last_checked_at' => now()])->save();

            return;
        }

        $this->mark($connection, 'error', $error);
    }

    private function reportFilters(Request $request): array
    {
        $today = now()->format('Y-m-d');
        $end = $this->validDate((string) $request->query('end_date', $today)) ?? $today;
        $end = $end > $today ? $today : $end;
        $start = $this->validDate((string) $request->query('start_date', now()->subDays(6)->format('Y-m-d')))
            ?? now()->subDays(6)->format('Y-m-d');
        $start = $start > $end ? $end : $start;

        return [
            'start_date' => $start,
            'end_date' => $end,
            'connection_id' => $request->integer('connection_id') ?: null,
            'order_id' => trim((string) $request->query('order_id', '')),
            'status' => in_array((int) $request->query('status'), [1, 2, 3, 4], true) ? (int) $request->query('status') : null,
        ];
    }

    private function reportQuery(int $workspaceId, array $filters): Builder
    {
        return ConversionRecord::query()
            ->where('workspace_id', $workspaceId)
            ->when($filters['connection_id'], fn ($query, $id) => $query->where('shopee_connection_id', $id))
            ->whereBetween('purchase_time', [$filters['start_date'].' 00:00:00', $filters['end_date'].' 23:59:59'])
            ->when($filters['order_id'], fn ($query, $orderId) => $query->where('checkout_id', 'like', '%'.$orderId.'%'))
            ->when($filters['status'], fn ($query, $status) => $query->where('conversion_status', $status));
    }

    private function validDate(string $value): ?string
    {
        try {
            $date = CarbonImmutable::createFromFormat('!Y-m-d', $value, 'Asia/Ho_Chi_Minh');
        } catch (\Throwable) {
            return null;
        }

        return $date && $date->format('Y-m-d') === $value ? $value : null;
    }

    private function csvCell(?string $value): string
    {
        $value ??= '';

        return preg_match('/^[=+\-@]/', $value) ? "'".$value : $value;
    }

    private function statusLabels(): array
    {
        return [1 => 'Chờ xử lý', 2 => 'Hoàn thành', 3 => 'Đã huỷ', 4 => 'Chưa thanh toán'];
    }
}
