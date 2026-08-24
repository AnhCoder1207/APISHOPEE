<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\WorkspaceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_admin_cannot_open_admin_console(): void
    {
        $user = User::factory()->create(['status' => 'active', 'is_admin' => false]);
        app(WorkspaceService::class)->createForUser($user);

        $this->actingAs($user)->get('/admin')->assertForbidden();
    }

    public function test_admin_can_update_workspace_quota_and_an_audit_log_is_written(): void
    {
        $admin = User::factory()->create(['status' => 'active', 'is_admin' => true]);
        app(WorkspaceService::class)->createForUser($admin);
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(WorkspaceService::class)->createForUser($owner);

        $this->actingAs($admin)->patch("/admin/workspaces/{$workspace->id}", [
            'status' => 'active',
            'monthly_quota' => 9000,
        ])->assertRedirect();

        $this->assertDatabaseHas('workspaces', ['id' => $workspace->id, 'monthly_quota' => 9000]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_user_id' => $admin->id,
            'action' => 'workspace.update',
            'target_id' => $workspace->id,
        ]);
    }
}
