<?php

namespace App\Services;

use App\Models\ConversionRecord;
use App\Models\LinkBatch;
use App\Models\ShopeeConnection;
use App\Models\User;
use App\Models\Workspace;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

class AffiliateDataService
{
    public function persistLinks(Workspace $workspace, User $user, ShopeeConnection $connection, array $input, array $items): LinkBatch
    {
        if (count($items) !== count($input['original_links'])) {
            throw new ApiException('SHOPEE_INVALID_RESPONSE', 'Shopee trả về thiếu kết quả cho một số link. Camlink chưa lưu lần xử lý này; vui lòng thử lại.', 502);
        }

        return DB::transaction(function () use ($workspace, $user, $connection, $input, $items) {
            $batch = LinkBatch::create([
                'workspace_id' => $workspace->id,
                'user_id' => $user->id,
                'shopee_connection_id' => $connection->id,
                'sub_id_1' => $input['sub_id_1'] ?? '',
                'sub_id_2' => $input['sub_id_2'] ?? '',
                'sub_id_3' => $input['sub_id_3'] ?? '',
                'sub_id_4' => $input['sub_id_4'] ?? '',
                'sub_id_5' => $input['sub_id_5'] ?? '',
                'item_count' => count($input['original_links']),
            ]);

            foreach ($input['original_links'] as $index => $originalLink) {
                $item = $items[$index];
                $batch->results()->create([
                    'workspace_id' => $workspace->id,
                    'original_link' => $originalLink,
                    'short_link' => $item['shortLink'] ?? null,
                    'long_link' => $item['longLink'] ?? null,
                    'fail_code' => (int) ($item['failCode'] ?? -1),
                ]);
            }

            return $batch;
        });
    }

    public function persistReports(Workspace $workspace, ShopeeConnection $connection, array $payload): int
    {
        $entries = data_get($payload, 'data.list', []);
        if (! is_array($entries)) {
            throw new ApiException('SHOPEE_INVALID_RESPONSE', 'Shopee trả về danh sách báo cáo không hợp lệ. Vui lòng thử lại.', 502);
        }

        $count = 0;
        DB::transaction(function () use (&$count, $workspace, $connection, $entries) {
            foreach ($entries as $entry) {
                if (! is_array($entry) || blank($entry['checkout_id'] ?? null)) {
                    continue;
                }

                $orders = is_array($entry['orders'] ?? null) ? $entry['orders'] : [];
                $orderValue = 0;
                foreach ($orders as $order) {
                    foreach (is_array($order['items'] ?? null) ? $order['items'] : [] as $item) {
                        if (! is_array($item)) {
                            continue;
                        }
                        $orderValue += ((float) ($item['actual_amount'] ?? 0)) > 0
                            ? (float) $item['actual_amount']
                            : (float) ($item['item_price'] ?? 0) * max(1, (int) ($item['qty'] ?? 1));
                    }
                }

                ConversionRecord::query()->updateOrCreate(
                    ['shopee_connection_id' => $connection->id, 'checkout_id' => (string) $entry['checkout_id']],
                    [
                        'workspace_id' => $workspace->id,
                        'purchase_time' => isset($entry['purchase_time']) ? now()->setTimestamp((int) $entry['purchase_time']) : null,
                        'conversion_status' => (int) ($entry['conversion_status'] ?? 0),
                        'source' => (string) ($entry['direct_source'] ?? $entry['utm_content'] ?? ''),
                        'order_count' => count($orders),
                        'order_value_internal' => (string) $orderValue,
                        'estimated_commission_internal' => (string) ($entry['estimated_total_commission'] ?? 0),
                        'payload' => $entry,
                        'last_synced_at' => now(),
                    ],
                );
                $count++;
            }
        });

        return $count;
    }
}
