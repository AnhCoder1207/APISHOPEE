<?php

namespace App\Services;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Str;

class WorkspaceService
{
    public function forUser(User $user): Workspace
    {
        return $user->currentWorkspace() ?? throw new \RuntimeException('User has no active workspace.');
    }

    public function createForUser(User $user): Workspace
    {
        $name = 'Workspace '.trim($user->name);

        $workspace = Workspace::create([
            'name' => $name,
            'slug' => Str::slug($user->name ?: 'workspace').'-'.Str::lower(Str::random(8)),
            'owner_user_id' => $user->id,
            'plan' => 'starter',
            'monthly_quota' => config('camlink.starter_monthly_quota'),
            'status' => 'active',
        ]);

        $workspace->users()->attach($user->id, ['role' => 'owner']);

        return $workspace;
    }
}
