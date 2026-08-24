<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\ConversionReportRequest;
use App\Models\ShopeeConnection;
use App\Models\Workspace;
use App\Services\AffiliateDataService;
use App\Services\Shopee\ShopeeAffiliateClient;
use App\Services\UsageService;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;

class ConversionReportController
{
    public function __invoke(ConversionReportRequest $request, ShopeeAffiliateClient $client, UsageService $usage, AffiliateDataService $data): JsonResponse
    {
        $workspace = $request->attributes->get('workspace');
        $user = $request->user();
        $apiKey = $request->attributes->get('api_key');
        $input = $request->validated();
        $usage->assertQuota($workspace, 1);
        $connection = $this->connection($workspace, $input['connection_id'] ?? null);
        $started = hrtime(true);
        $usageRecorded = false;

        try {
            $response = $client->conversionReports($connection->encrypted_cookie, $input);
            if ($client->isAuthError($response)) {
                $this->mark($connection, 'expired', 'SHOPEE_SESSION_EXPIRED');
                $usage->record($user, $workspace, 'conversion_report', $response->status(), 1, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
                $usageRecorded = true;
                throw new ApiException('SHOPEE_SESSION_EXPIRED', 'Shopee không chấp nhận phiên đăng nhập đang lưu. Hãy đăng nhập lại affiliate.shopee.vn, xuất file cookie mới rồi cập nhật kết nối trên Camlink.', 422);
            }
            if ($response->failed()) {
                $this->mark($connection, 'error', 'SHOPEE_UPSTREAM_ERROR');
                $usage->record($user, $workspace, 'conversion_report', $response->status(), 1, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
                $usageRecorded = true;
                throw new ApiException('SHOPEE_UPSTREAM_ERROR', $client->upstreamErrorMessage($response), 502);
            }

            $payload = $client->payload($response, 'data.list', true);
            $synced = $data->persistReports($workspace, $connection, $payload);
            $this->mark($connection, 'connected');
            $usage->record($user, $workspace, 'conversion_report', $response->status(), 1, $apiKey, true, $this->duration($started), [
                'connection_id' => $connection->id,
                'synced_records' => $synced,
                'page' => $input['page'],
            ]);
            $usageRecorded = true;

            return response()->json(['success' => true, 'data' => $payload, 'meta' => [
                'connection_id' => $connection->id,
                'connection_name' => $connection->name,
                'synced_records' => $synced,
                'request_id' => $request->attributes->get('request_id'),
            ]]);
        } catch (ApiException $exception) {
            if (! $usageRecorded) {
                $this->mark($connection, $exception->errorCode === 'SHOPEE_SESSION_EXPIRED' ? 'expired' : 'error', $exception->errorCode);
                $usage->record($user, $workspace, 'conversion_report', $exception->status, 1, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
            }
            throw $exception;
        } catch (\Throwable $exception) {
            $usage->record($user, $workspace, 'conversion_report', 502, 1, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
            throw new ApiException('SHOPEE_INVALID_RESPONSE', 'Shopee trả về dữ liệu không hợp lệ hoặc đang chặn yêu cầu.', 502);
        }
    }

    private function connection(Workspace $workspace, ?int $connectionId): ShopeeConnection
    {
        $query = $workspace->connections()->whereNull('deleted_at');
        $connection = $connectionId
            ? $query->whereKey($connectionId)->first()
            : $query->orderByRaw("case when status = 'connected' then 0 else 1 end")
                ->orderByDesc('is_default')
                ->orderBy('created_at')
                ->first();
        if (! $connection) {
            throw new ApiException('SHOPEE_CONNECTION_NOT_FOUND', 'Chưa có tài khoản Shopee phù hợp.', 404);
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

    private function duration(int $started): int
    {
        return (int) ((hrtime(true) - $started) / 1_000_000);
    }
}
