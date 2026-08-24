<?php

namespace Tests\Feature;

use App\Models\ConversionRecord;
use App\Models\ShopeeConnection;
use App\Models\User;
use App\Services\WorkspaceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebAffiliateToolsTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_convert_link_saves_results_without_charging_quota(): void
    {
        [$user, $workspace, $connection] = $this->context();
        Http::fake([
            '*gql*' => Http::response([
                'data' => ['batchCustomLink' => [[
                    'shortLink' => 'https://s.shopee.vn/web-abc',
                    'longLink' => 'https://shope.ee/web-long',
                    'failCode' => 0,
                ]]],
            ], 200),
        ]);

        $this->actingAs($user)->post(route('tools.convert-link.store'), [
            'connection_id' => $connection->id,
            'original_links' => ['https://shopee.vn/product/1/2', '', ''],
            'sub_id_1' => 'website',
        ])->assertRedirect(route('tools.convert-link'))
            ->assertSessionHas('status', 'Đã tạo link Affiliate. Kết quả không tính vào hạn mức API.');

        $this->assertDatabaseHas('link_results', [
            'workspace_id' => $workspace->id,
            'short_link' => 'https://s.shopee.vn/web-abc',
        ]);
        $this->assertDatabaseHas('usage_events', [
            'workspace_id' => $workspace->id,
            'event_type' => 'web_convert_link',
            'billable' => 0,
        ]);
        Http::assertSent(fn ($request) => $request->hasHeader('sec-ch-ua')
            && $request->hasHeader('sec-fetch-dest', 'empty'));
    }

    public function test_web_convert_link_keeps_a_logged_in_connection_available_after_a_shopee_rejection(): void
    {
        [$user, $workspace, $connection] = $this->context();
        Http::fake(['*gql*' => Http::response(['is_login' => true, 'error' => 90309999], 403)]);

        $this->actingAs($user)->post(route('tools.convert-link.store'), [
            'connection_id' => $connection->id,
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertRedirect()
            ->assertSessionHasErrors(['tool' => 'Shopee vẫn nhận ra tài khoản nhưng chưa chấp nhận yêu cầu tạo link này. Vui lòng thử lại sau ít phút.']);

        $this->assertDatabaseHas('shopee_connections', [
            'id' => $connection->id,
            'status' => 'connected',
            'last_error_code' => 'SHOPEE_UPSTREAM_ERROR',
        ]);
        $this->assertDatabaseHas('usage_events', [
            'workspace_id' => $workspace->id,
            'event_type' => 'web_convert_link',
            'billable' => 0,
        ]);
    }

    public function test_web_report_sync_saves_records_without_charging_quota(): void
    {
        [$user, $workspace, $connection] = $this->context();
        Http::fake([
            '*report/list*' => Http::response([
                'code' => 0,
                'msg' => 'success',
                'data' => [
                    'list' => [[
                        'checkout_id' => 'web-checkout-1',
                        'purchase_time' => 1787147948,
                        'conversion_status' => 2,
                        'direct_source' => 'Website',
                        'estimated_total_commission' => 120000,
                        'orders' => [['items' => [['actual_amount' => 1800000, 'qty' => 1]]]],
                    ]],
                ],
            ], 200),
        ]);

        $this->actingAs($user)->post(route('tools.conversion-reports.sync'), [
            'connection_id' => $connection->id,
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-24',
            'limit' => 20,
            'page' => 1,
        ])->assertRedirect()
            ->assertSessionHas('status', 'Đã đồng bộ 1 bản ghi. Lần đồng bộ trên web không tính vào hạn mức API.');

        $this->assertDatabaseHas('conversion_records', [
            'workspace_id' => $workspace->id,
            'checkout_id' => 'web-checkout-1',
            'conversion_status' => 2,
        ]);
        $this->assertDatabaseHas('usage_events', [
            'workspace_id' => $workspace->id,
            'event_type' => 'web_conversion_sync',
            'billable' => 0,
        ]);
    }

    public function test_report_page_filters_local_records_and_can_export_csv(): void
    {
        [$user, $workspace, $connection] = $this->context();
        ConversionRecord::create([
            'workspace_id' => $workspace->id,
            'shopee_connection_id' => $connection->id,
            'checkout_id' => 'csv-checkout-1',
            'purchase_time' => '2026-08-20 12:00:00',
            'conversion_status' => 3,
            'source' => 'TikTok',
            'order_count' => 1,
            'order_value_internal' => '250000000000',
            'estimated_commission_internal' => '18000000000',
            'payload' => ['checkout_id' => 'csv-checkout-1'],
            'last_synced_at' => now(),
        ]);

        $this->actingAs($user)->get(route('tools.conversion-reports', [
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-24',
            'status' => 3,
        ]))->assertOk()
            ->assertSee('csv-checkout-1')
            ->assertSee('TikTok')
            ->assertSee('2.500.000đ')
            ->assertSee('Đã huỷ')
            ->assertDontSee('@else');

        $response = $this->actingAs($user)->get(route('tools.conversion-reports.export', [
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-24',
        ]));
        $response->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');
        $this->assertStringContainsString('csv-checkout-1', $response->streamedContent());
    }

    public function test_web_report_sync_fetches_all_pages_from_shopee(): void
    {
        [$user, $workspace, $connection] = $this->context();
        $firstPage = array_map(fn ($index) => [
            'checkout_id' => 'page-checkout-'.$index,
            'purchase_time' => 1787147948,
            'conversion_status' => 2,
            'orders' => [],
        ], range(1, 100));
        Http::fakeSequence()
            ->push(['code' => 0, 'data' => ['total_count' => 101, 'list' => $firstPage]], 200)
            ->push(['code' => 0, 'data' => ['total_count' => 101, 'list' => [[
                'checkout_id' => 'page-checkout-101',
                'purchase_time' => 1787147948,
                'conversion_status' => 2,
                'orders' => [],
            ]]]], 200);

        $this->actingAs($user)->post(route('tools.conversion-reports.sync'), [
            'connection_id' => $connection->id,
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-24',
            'limit' => 100,
            'page' => 1,
        ])->assertRedirect()->assertSessionHas('status', 'Đã cập nhật 101 bản ghi từ 2 trang Shopee. Thao tác này không trừ hạn mức API.');

        $this->assertDatabaseCount('conversion_records', 101);
        $this->assertDatabaseHas('usage_events', ['workspace_id' => $workspace->id, 'event_type' => 'web_conversion_sync', 'billable' => 0]);
    }

    private function context(): array
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = app(WorkspaceService::class)->createForUser($user);
        $connection = ShopeeConnection::create([
            'workspace_id' => $workspace->id,
            'created_by' => $user->id,
            'name' => 'Shopee web',
            'encrypted_cookie' => 'SPC_ST=secret; SPC_U=123',
            'status' => 'connected',
            'is_default' => true,
        ]);

        return [$user, $workspace, $connection];
    }
}
