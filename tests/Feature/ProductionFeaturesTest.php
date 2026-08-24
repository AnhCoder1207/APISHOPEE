<?php

namespace Tests\Feature;

use App\Models\ShopeeConnection;
use App\Models\User;
use App\Services\WorkspaceService;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ProductionFeaturesTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoints_and_security_headers_are_available(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'SAMEORIGIN');

        $this->getJson('/api/health/ready')
            ->assertOk()
            ->assertJsonPath('checks.database', 'ok');
    }

    public function test_password_reset_flow_can_send_a_link(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'reset@example.com']);
        app(WorkspaceService::class)->createForUser($user);

        $this->post('/forgot-password', ['email' => $user->email])
            ->assertRedirect()
            ->assertSessionHas('status');

        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_a_connection_can_be_updated_through_the_app_api(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = app(WorkspaceService::class)->createForUser($user);
        $connection = ShopeeConnection::create([
            'workspace_id' => $workspace->id,
            'created_by' => $user->id,
            'name' => 'Shopee cũ',
            'encrypted_cookie' => 'SPC_ST=secret; SPC_U=123',
            'status' => 'connected',
            'is_default' => true,
        ]);

        $this->withoutMiddleware([ValidateCsrfToken::class]);
        $this->actingAs($user)->patchJson("/api/app/connections/{$connection->id}", [
            'name' => 'Shopee mới',
        ])->assertOk()->assertJsonPath('data.name', 'Shopee mới');

        $this->assertDatabaseHas('shopee_connections', ['id' => $connection->id, 'name' => 'Shopee mới']);
    }

    public function test_an_expired_connection_cookie_can_be_replaced_on_the_dashboard(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = app(WorkspaceService::class)->createForUser($user);
        $connection = ShopeeConnection::create([
            'workspace_id' => $workspace->id,
            'created_by' => $user->id,
            'name' => 'Shopee chính',
            'encrypted_cookie' => 'SPC_ST=old; SPC_U=123',
            'status' => 'expired',
            'is_default' => true,
        ]);
        Http::fake(['*report/list*' => Http::response([
            'code' => 0,
            'data' => ['list' => []],
        ], 200)]);
        $cookieJson = json_encode([
            ['domain' => '.shopee.vn', 'name' => 'SPC_ST', 'value' => 'new-secret'],
            ['domain' => '.shopee.vn', 'name' => 'SPC_U', 'value' => '456'],
        ], JSON_THROW_ON_ERROR);

        $this->actingAs($user)->patch(route('dashboard.connections.update', $connection), [
            'name' => 'Shopee chính',
            'cookie_json' => $cookieJson,
        ])->assertRedirect()->assertSessionHas('status');

        $updated = $connection->fresh();
        $this->assertSame('connected', $updated->status);
        $this->assertStringContainsString('SPC_ST=new-secret', $updated->encrypted_cookie);
        $this->assertNull($updated->last_error_code);
    }

    public function test_a_cookie_is_not_saved_when_shopee_rejects_it_inside_an_http_200_response(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = app(WorkspaceService::class)->createForUser($user);
        Http::fake(['*report/list*' => Http::response([
            'code' => 10001,
            'msg' => 'request rejected',
            'data' => ['list' => []],
        ], 200)]);
        $cookieJson = json_encode([
            ['domain' => '.shopee.vn', 'name' => 'SPC_ST', 'value' => 'rejected-secret'],
            ['domain' => '.shopee.vn', 'name' => 'SPC_U', 'value' => '456'],
        ], JSON_THROW_ON_ERROR);

        $this->actingAs($user)->post(route('dashboard.connections.store'), [
            'name' => 'Shopee bị từ chối',
            'cookie_json' => $cookieJson,
        ])->assertRedirect()->assertSessionHasErrors('cookie_json');

        $this->assertDatabaseMissing('shopee_connections', [
            'workspace_id' => $workspace->id,
            'name' => 'Shopee bị từ chối',
        ]);
    }

    public function test_a_cookie_is_accepted_when_shopee_returns_a_null_empty_report_list(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = app(WorkspaceService::class)->createForUser($user);
        Http::fake(['*report/list*' => Http::response([
            'code' => 0,
            'msg' => 'success',
            'data' => [
                'page_num' => 1,
                'page_size' => 20,
                'total_count' => 0,
                'list' => null,
            ],
        ], 200)]);
        $cookieJson = json_encode([
            ['domain' => '.shopee.vn', 'name' => 'SPC_ST', 'value' => 'valid-secret'],
            ['domain' => '.shopee.vn', 'name' => 'SPC_U', 'value' => '456'],
        ], JSON_THROW_ON_ERROR);

        $this->actingAs($user)->post(route('dashboard.connections.store'), [
            'name' => 'Shopee không có đơn',
            'cookie_json' => $cookieJson,
        ])->assertRedirect()->assertSessionHas('status');

        $this->assertDatabaseHas('shopee_connections', [
            'workspace_id' => $workspace->id,
            'name' => 'Shopee không có đơn',
            'status' => 'connected',
        ]);
    }
}
