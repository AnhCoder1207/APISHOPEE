<?php

namespace App\Http\Controllers\Api;

use App\Services\UsageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UsageController
{
    public function __invoke(Request $request, UsageService $usage): JsonResponse
    {
        $workspace = $request->attributes->get('workspace') ?? $request->user()->currentWorkspace();

        return response()->json(['success' => true, 'data' => $usage->summary($workspace)]);
    }
}
