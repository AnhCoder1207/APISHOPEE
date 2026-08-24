<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\ConvertLinkRequest;
use App\Models\ShopeeConnection;
use App\Models\Workspace;
use App\Services\AffiliateDataService;
use App\Services\Shopee\ShopeeAffiliateClient;
use App\Services\UsageService;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;

class ConvertLinkController
{
    public function __invoke(ConvertLinkRequest $request, ShopeeAffiliateClient $client, UsageService $usage, AffiliateDataService $data): JsonResponse
    {
        $workspace = $request->attributes->get('workspace');
        $user = $request->user();
        $apiKey = $request->attributes->get('api_key');
        $input = $request->validated();
        $units = count($input['original_links']);
        $usage->assertQuota($workspace, $units);
        $connection = $this->connection($workspace, $input['connection_id'] ?? null);
        $started = hrtime(true);
        $usageRecorded = false;

        try {
            $response = $client->convertLinks($connection->encrypted_cookie, $input);
            if ($client->isAuthError($response)) {
                $this->mark($connection, 'expired', 'SHOPEE_SESSION_EXPIRED');
                $usage->record($user, $workspace, 'convert_link', $response->status(), $units, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
                $usageRecorded = true;
                throw new ApiException('SHOPEE_SESSION_EXPIRED', 'Shopee không chấp nhận phiên đăng nhập đang lưu. Hãy đăng nhập lại affiliate.shopee.vn, xuất file cookie mới rồi cập nhật kết nối trên Camlink.', 422);
            }
            if ($response->failed()) {
                $this->markFailure($connection, 'SHOPEE_UPSTREAM_ERROR', $response->json('is_login') === true);
                $usage->record($user, $workspace, 'convert_link', $response->status(), $units, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
                $usageRecorded = true;
                throw new ApiException('SHOPEE_UPSTREAM_ERROR', $client->upstreamErrorMessage($response), 502);
            }

            $payload = $client->payload($response, 'data.batchCustomLink');
            $items = data_get($payload, 'data.batchCustomLink', []);
            $data->persistLinks($workspace, $user, $connection, $input, $items);

            $this->mark($connection, 'connected');
            $usage->record($user, $workspace, 'convert_link', $response->status(), $units, $apiKey, true, $this->duration($started), ['connection_id' => $connection->id]);
            $usageRecorded = true;

            return response()->json(['success' => true, 'data' => $payload, 'meta' => [
                'connection_id' => $connection->id,
                'connection_name' => $connection->name,
                'usage_units' => $units,
                'request_id' => $request->attributes->get('request_id'),
            ]]);
        } catch (ApiException $exception) {
            if (! $usageRecorded) {
                $this->markFailure($connection, $exception->errorCode, isset($response) && $response->json('is_login') === true);
                $usage->record($user, $workspace, 'convert_link', $exception->status, $units, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
            }
            throw $exception;
        } catch (\Throwable $exception) {
            $usage->record($user, $workspace, 'convert_link', 502, $units, $apiKey, false, $this->duration($started), ['connection_id' => $connection->id]);
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

    private function duration(int $started): int
    {
        return (int) ((hrtime(true) - $started) / 1_000_000);
    }
}
