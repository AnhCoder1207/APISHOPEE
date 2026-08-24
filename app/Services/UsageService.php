<?php

namespace App\Services;

use App\Models\ApiKey;
use App\Models\UsageEvent;
use App\Models\User;
use App\Models\Workspace;
use App\Support\ApiException;
use Illuminate\Support\Str;

class UsageService
{
    public function assertQuota(Workspace $workspace, int $units): void
    {
        $used = UsageEvent::query()
            ->where('workspace_id', $workspace->id)
            ->where('billable', true)
            ->where('created_at', '>=', now()->startOfMonth())
            ->sum('units');

        if ($used + $units > $workspace->monthly_quota) {
            throw new ApiException('MONTHLY_QUOTA_EXCEEDED', 'Workspace đã hết hạn mức sử dụng tháng này.', 429);
        }
    }

    public function record(
        User $user,
        Workspace $workspace,
        string $eventType,
        int $statusCode,
        int $units = 1,
        ?ApiKey $apiKey = null,
        bool $billable = true,
        ?int $durationMs = null,
        array $metadata = [],
    ): UsageEvent {
        return UsageEvent::create([
            'workspace_id' => $workspace->id,
            'user_id' => $user->id,
            'api_key_id' => $apiKey?->id,
            'request_id' => request()->attributes->get('request_id', (string) Str::uuid()),
            'event_type' => $eventType,
            'status_code' => $statusCode,
            'units' => $units,
            'billable' => $billable,
            'duration_ms' => $durationMs,
            'metadata' => $metadata,
        ]);
    }

    public function summary(Workspace $workspace): array
    {
        $used = (int) UsageEvent::query()
            ->where('workspace_id', $workspace->id)
            ->where('billable', true)
            ->where('created_at', '>=', now()->startOfMonth())
            ->sum('units');

        return [
            'monthly_quota' => $workspace->monthly_quota,
            'used' => $used,
            'remaining' => max(0, $workspace->monthly_quota - $used),
            'reset_at' => now()->startOfMonth()->addMonth()->toIso8601String(),
        ];
    }
}
