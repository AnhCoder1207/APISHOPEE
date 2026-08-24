<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\StoreConnectionRequest;
use App\Models\ShopeeConnection;
use App\Services\Shopee\ShopeeConnectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConnectionController
{
    public function index(Request $request): JsonResponse
    {
        $workspace = $request->user()->currentWorkspace();

        return response()->json(['success' => true, 'data' => $workspace->connections()->latest()->get()->map(fn (ShopeeConnection $connection) => $this->safe($connection))]);
    }

    public function store(StoreConnectionRequest $request, ShopeeConnectionService $connections): JsonResponse
    {
        $workspace = $request->user()->currentWorkspace();
        $connection = $connections->create($request->user(), $workspace, $request->validated());

        return response()->json(['success' => true, 'data' => $this->safe($connection)], 201);
    }

    public function update(StoreConnectionRequest $request, int $connection, ShopeeConnectionService $connections): JsonResponse
    {
        $workspace = $request->user()->currentWorkspace();
        $model = $workspace->connections()->whereKey($connection)->firstOrFail();
        $model = $connections->update($model, $workspace, $request->validated());

        return response()->json(['success' => true, 'data' => $this->safe($model)]);
    }

    public function destroy(Request $request, int $connection): JsonResponse
    {
        $workspace = $request->user()->currentWorkspace();
        $model = $workspace->connections()->whereKey($connection)->firstOrFail();
        $wasDefault = $model->is_default;
        $model->delete();
        if ($wasDefault) {
            $workspace->connections()->whereNull('deleted_at')->oldest()->first()?->update(['is_default' => true]);
        }

        return response()->json(['success' => true]);
    }

    public function check(Request $request, int $connection, ShopeeConnectionService $connections): JsonResponse
    {
        $model = $request->user()->currentWorkspace()->connections()->whereKey($connection)->firstOrFail();

        return response()->json(['success' => true, 'data' => $this->safe($connections->check($model))]);
    }

    private function safe(ShopeeConnection $connection): array
    {
        return $connection->only(['id', 'name', 'status', 'is_default', 'affiliate_id', 'affiliate_name', 'last_checked_at', 'last_error_code', 'created_at']);
    }
}
