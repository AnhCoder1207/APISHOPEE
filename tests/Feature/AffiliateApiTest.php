<?php

namespace Tests\Feature;

use App\Models\ApiKey;
use App\Models\ShopeeConnection;
use App\Models\User;
use App\Services\WorkspaceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AffiliateApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_rejects_requests_without_an_api_key(): void
    {
        $this->postJson('/api/v1/affiliate/convert-link', [
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertUnauthorized()->assertJsonPath('error.code', 'INVALID_API_KEY');
    }

    public function test_convert_link_uses_a_stored_connection_and_records_usage(): void
    {
        [$user, $workspace, $connection, $token] = $this->context();

        Http::fake([
            '*gql*' => Http::response([
                'data' => ['batchCustomLink' => [[
                    'shortLink' => 'https://s.shopee.vn/abc',
                    'longLink' => 'https://shope.ee/an_redir?x=1',
                    'failCode' => 0,
                ]]],
            ], 200),
        ]);

        $response = $this->withToken($token)->postJson('/api/v1/affiliate/convert-link', [
            'connection_id' => $connection->id,
            'original_links' => ['https://shopee.vn/product/1/2'],
            'sub_id_1' => 'facebook',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.data.batchCustomLink.0.shortLink', 'https://s.shopee.vn/abc')
            ->assertJsonPath('meta.usage_units', 1);

        $this->assertDatabaseHas('link_results', ['workspace_id' => $workspace->id, 'fail_code' => 0]);
        $this->assertDatabaseHas('usage_events', ['workspace_id' => $workspace->id, 'event_type' => 'convert_link', 'units' => 1, 'billable' => 1]);
        $this->assertNotSame('SPC_ST=secret; SPC_U=123', DB::table('shopee_connections')->where('id', $connection->id)->value('encrypted_cookie'));
        $this->assertNotEmpty($response->headers->get('X-Request-Id'));
        Http::assertSent(fn ($request) => $request->hasHeader('Cookie', 'SPC_ST=secret; SPC_U=123')
            && $request->hasHeader('sec-ch-ua', '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"')
            && $request->hasHeader('sec-fetch-dest', 'empty'));
    }

    public function test_conversion_report_is_persisted(): void
    {
        [, $workspace, $connection, $token] = $this->context();

        Http::fake([
            '*report/list*' => Http::response([
                'code' => 0,
                'msg' => 'success',
                'data' => [
                    'page_num' => 1,
                    'page_size' => 20,
                    'total_count' => 1,
                    'list' => [[
                        'checkout_id' => 'checkout-1',
                        'purchase_time' => 1787147948,
                        'conversion_status' => 2,
                        'direct_source' => 'Zalo',
                        'estimated_total_commission' => 150000,
                        'orders' => [[
                            'items' => [['actual_amount' => 2500000, 'qty' => 1]],
                        ]],
                    ]],
                ],
            ], 200),
        ]);

        $this->withToken($token)->postJson('/api/v1/affiliate/conversion-reports', [
            'connection_id' => $connection->id,
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-24',
            'limit' => 20,
            'page' => 1,
        ])->assertOk()->assertJsonPath('meta.synced_records', 1);

        $this->assertDatabaseHas('conversion_records', [
            'workspace_id' => $workspace->id,
            'checkout_id' => 'checkout-1',
            'conversion_status' => 2,
        ]);
    }

    public function test_quota_is_enforced_before_calling_shopee(): void
    {
        [, $workspace, , $token] = $this->context();
        $workspace->update(['monthly_quota' => 0]);
        Http::fake();

        $this->withToken($token)->postJson('/api/v1/affiliate/convert-link', [
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertStatus(429)->assertJsonPath('error.code', 'MONTHLY_QUOTA_EXCEEDED');

        Http::assertNothingSent();
    }

    public function test_expired_shopee_cookie_marks_connection_and_is_not_billable(): void
    {
        [, $workspace, $connection, $token] = $this->context();
        Http::fake(['*gql*' => Http::response(['is_login' => false, 'error' => 90309999], 403)]);

        $this->withToken($token)->postJson('/api/v1/affiliate/convert-link', [
            'connection_id' => $connection->id,
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertStatus(422)->assertJsonPath('error.code', 'SHOPEE_SESSION_EXPIRED');

        $this->assertDatabaseHas('shopee_connections', ['id' => $connection->id, 'status' => 'expired']);
        $this->assertDatabaseHas('usage_events', ['workspace_id' => $workspace->id, 'event_type' => 'convert_link', 'billable' => 0]);
    }

    public function test_logged_in_shopee_rejection_does_not_expire_the_connection(): void
    {
        [, $workspace, $connection, $token] = $this->context();
        Http::fake(['*gql*' => Http::response(['is_login' => true, 'error' => 90309999], 403)]);

        $this->withToken($token)->postJson('/api/v1/affiliate/convert-link', [
            'connection_id' => $connection->id,
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertStatus(502)
            ->assertJsonPath('error.code', 'SHOPEE_UPSTREAM_ERROR')
            ->assertJsonPath('error.message', 'Shopee vẫn nhận ra tài khoản nhưng chưa chấp nhận yêu cầu tạo link này. Vui lòng thử lại sau ít phút.');

        $this->assertDatabaseHas('shopee_connections', [
            'id' => $connection->id,
            'status' => 'connected',
            'last_error_code' => 'SHOPEE_UPSTREAM_ERROR',
        ]);
        $this->assertDatabaseHas('usage_events', ['workspace_id' => $workspace->id, 'event_type' => 'convert_link', 'billable' => 0]);
    }

    public function test_graphql_application_error_is_not_treated_as_a_success(): void
    {
        [, $workspace, $connection, $token] = $this->context();
        Http::fake(['*gql*' => Http::response([
            'errors' => [['message' => 'upstream rejected request']],
            'data' => ['batchCustomLink' => null],
        ], 200)]);

        $this->withToken($token)->postJson('/api/v1/affiliate/convert-link', [
            'connection_id' => $connection->id,
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertStatus(502)->assertJsonPath('error.code', 'SHOPEE_REQUEST_REJECTED');

        $this->assertDatabaseMissing('link_batches', ['workspace_id' => $workspace->id]);
        $this->assertDatabaseHas('shopee_connections', [
            'id' => $connection->id,
            'status' => 'error',
            'last_error_code' => 'SHOPEE_REQUEST_REJECTED',
        ]);
        $this->assertDatabaseHas('usage_events', ['workspace_id' => $workspace->id, 'event_type' => 'convert_link', 'billable' => 0]);
    }

    public function test_report_application_error_is_not_persisted_or_billed(): void
    {
        [, $workspace, $connection, $token] = $this->context();
        Http::fake(['*report/list*' => Http::response([
            'code' => 10001,
            'msg' => 'request rejected',
            'data' => ['list' => []],
        ], 200)]);

        $this->withToken($token)->postJson('/api/v1/affiliate/conversion-reports', [
            'connection_id' => $connection->id,
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-24',
            'limit' => 20,
            'page' => 1,
        ])->assertStatus(502)->assertJsonPath('error.code', 'SHOPEE_REQUEST_REJECTED');

        $this->assertDatabaseCount('conversion_records', 0);
        $this->assertDatabaseHas('usage_events', ['workspace_id' => $workspace->id, 'event_type' => 'conversion_report', 'billable' => 0]);
    }

    public function test_a_connection_from_another_workspace_cannot_be_used(): void
    {
        [, , , $token] = $this->context();
        $otherUser = User::factory()->create(['status' => 'active']);
        $otherWorkspace = app(WorkspaceService::class)->createForUser($otherUser);
        $otherConnection = ShopeeConnection::create([
            'workspace_id' => $otherWorkspace->id,
            'created_by' => $otherUser->id,
            'name' => 'Other',
            'encrypted_cookie' => 'SPC_ST=other; SPC_U=999',
            'status' => 'connected',
            'is_default' => true,
        ]);

        $this->withToken($token)->postJson('/api/v1/affiliate/convert-link', [
            'connection_id' => $otherConnection->id,
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertNotFound()->assertJsonPath('error.code', 'SHOPEE_CONNECTION_NOT_FOUND');
    }

    public function test_a_connection_marked_expired_must_be_updated_before_api_use(): void
    {
        [, , $connection, $token] = $this->context();
        $connection->update(['status' => 'expired']);
        Http::fake();

        $this->withToken($token)->postJson('/api/v1/affiliate/convert-link', [
            'connection_id' => $connection->id,
            'original_links' => ['https://shopee.vn/product/1/2'],
        ])->assertStatus(422)->assertJsonPath('error.code', 'SHOPEE_CONNECTION_NOT_READY');

        Http::assertNothingSent();
    }

    private function context(): array
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = app(WorkspaceService::class)->createForUser($user);
        $connection = ShopeeConnection::create([
            'workspace_id' => $workspace->id,
            'created_by' => $user->id,
            'name' => 'Shopee chính',
            'encrypted_cookie' => 'SPC_ST=secret; SPC_U=123',
            'status' => 'connected',
            'is_default' => true,
        ]);
        $token = 'clk_live_'.str_repeat('a', 48);
        ApiKey::create([
            'workspace_id' => $workspace->id,
            'created_by' => $user->id,
            'name' => 'Test key',
            'key_prefix' => substr($token, 0, 20),
            'key_hash' => hash('sha256', $token),
            'abilities' => ['affiliate:convert', 'affiliate:reports'],
        ]);

        return [$user, $workspace, $connection, $token];
    }
}
