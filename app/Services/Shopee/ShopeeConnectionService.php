<?php

namespace App\Services\Shopee;

use App\Models\ShopeeConnection;
use App\Models\User;
use App\Models\Workspace;
use App\Support\ApiException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;

class ShopeeConnectionService
{
    public function __construct(
        private ShopeeCookieParser $parser,
        private ShopeeAffiliateClient $client,
    ) {}

    public function create(User $user, Workspace $workspace, array $input): ShopeeConnection
    {
        try {
            $cookie = $this->parser->parseExport($input['cookie_json'])['cookieHeader'];
        } catch (\InvalidArgumentException $exception) {
            throw new ApiException('INVALID_SHOPEE_COOKIE_FILE', $exception->getMessage(), 422);
        }

        $affiliate = $this->validate($cookie);

        return DB::transaction(function () use ($workspace, $user, $input, $cookie, $affiliate) {
            if ($input['is_default'] ?? false) {
                $workspace->connections()->update(['is_default' => false]);
            }
            $isFirst = ! $workspace->connections()->exists();

            return $workspace->connections()->create([
                'created_by' => $user->id,
                'name' => $input['name'],
                'encrypted_cookie' => $cookie,
                'status' => 'connected',
                'is_default' => ($input['is_default'] ?? false) || $isFirst,
                'affiliate_id' => $affiliate['affiliate_id'],
                'affiliate_name' => $affiliate['affiliate_name'],
                'last_checked_at' => now(),
            ]);
        });
    }

    public function update(ShopeeConnection $connection, Workspace $workspace, array $input): ShopeeConnection
    {
        $attributes = ['name' => $input['name'] ?? $connection->name];
        $affiliate = null;

        if (filled($input['cookie_json'] ?? null)) {
            try {
                $cookie = $this->parser->parseExport($input['cookie_json'])['cookieHeader'];
            } catch (\InvalidArgumentException $exception) {
                throw new ApiException('INVALID_SHOPEE_COOKIE_FILE', $exception->getMessage(), 422);
            }

            $affiliate = $this->validate($cookie);
            $attributes += [
                'encrypted_cookie' => $cookie,
                'status' => 'connected',
                'affiliate_id' => $affiliate['affiliate_id'] ?? null,
                'affiliate_name' => $affiliate['affiliate_name'] ?? null,
                'last_checked_at' => now(),
                'last_error_code' => null,
            ];
        }

        return DB::transaction(function () use ($workspace, $connection, $input, $attributes) {
            if ($input['is_default'] ?? false) {
                $workspace->connections()->whereNull('deleted_at')->update(['is_default' => false]);
            }

            $connection->update($attributes + (array_key_exists('is_default', $input)
                ? ['is_default' => (bool) $input['is_default']]
                : []));

            return $connection->fresh();
        });
    }

    public function check(ShopeeConnection $connection): ShopeeConnection
    {
        try {
            $affiliate = $this->validate($connection->encrypted_cookie);
            $connection->update([
                'status' => 'connected',
                'affiliate_id' => $affiliate['affiliate_id'] ?? $connection->affiliate_id,
                'affiliate_name' => $affiliate['affiliate_name'] ?? $connection->affiliate_name,
                'last_checked_at' => now(),
                'last_error_code' => null,
            ]);

            return $connection->fresh();
        } catch (ApiException $exception) {
            $connection->update([
                'status' => $exception->errorCode === 'SHOPEE_SESSION_EXPIRED' ? 'expired' : 'error',
                'last_checked_at' => now(),
                'last_error_code' => $exception->errorCode,
            ]);
            throw $exception;
        }
    }

    private function validate(string $cookie): array
    {
        $yesterday = now()->subDay()->format('Y-m-d');
        try {
            $response = $this->client->conversionReports($cookie, [
                'start_date' => $yesterday,
                'end_date' => $yesterday,
                'limit' => 20,
                'page' => 1,
            ]);
        } catch (ConnectionException $exception) {
            report($exception);
            throw new ApiException(
                'SHOPEE_CONNECTION_FAILED',
                'Camlink chưa liên lạc được với Shopee nên chưa thể kiểm tra file cookie. File của bạn chưa được lưu. Vui lòng thử lại sau ít phút.',
                502,
            );
        } catch (\Throwable $exception) {
            report($exception);
            throw new ApiException('SHOPEE_CONNECTION_FAILED', 'Có lỗi khi Camlink kiểm tra phiên đăng nhập Shopee. File cookie chưa được lưu. Vui lòng thử lại.', 502);
        }

        try {
            $this->client->payload($response, 'data.list', true);
        } catch (ApiException $exception) {
            if ($exception->errorCode === 'SHOPEE_SESSION_EXPIRED') {
                throw new ApiException('SHOPEE_SESSION_EXPIRED', 'Shopee không chấp nhận phiên đăng nhập trong file này. Hãy đăng nhập lại affiliate.shopee.vn, xuất file cookie mới rồi tải lên Camlink.', 422);
            }

            throw new ApiException('SHOPEE_CONNECTION_FAILED', 'Shopee chưa xác nhận được phiên đăng nhập trong file này. File cookie chưa được lưu. Vui lòng thử lại sau ít phút.', 502);
        }

        return $this->client->extractAffiliate($response);
    }
}
