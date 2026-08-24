<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class HealthController
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'service' => 'camlink-api',
            'environment' => app()->environment(),
            'timestamp' => now()->toIso8601String(),
        ]);
    }

    public function ready(): JsonResponse
    {
        try {
            DB::select('select 1');
        } catch (\Throwable) {
            return response()->json([
                'status' => 'degraded',
                'service' => 'camlink-api',
                'checks' => ['database' => 'failed'],
                'timestamp' => now()->toIso8601String(),
            ], 503);
        }

        return response()->json([
            'status' => 'ready',
            'service' => 'camlink-api',
            'checks' => ['database' => 'ok'],
            'timestamp' => now()->toIso8601String(),
        ]);
    }
}
