<?php

namespace App\Http\Controllers\Api;

use App\Models\ApiKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ApiKeyController
{
    public function index(Request $request): JsonResponse
    {
        $keys = $request->user()->currentWorkspace()->apiKeys()
            ->whereNull('revoked_at')
            ->latest()
            ->get(['id', 'name', 'key_prefix', 'abilities', 'last_used_at', 'expires_at', 'created_at']);

        return response()->json(['success' => true, 'data' => $keys]);
    }

    public function store(Request $request): JsonResponse
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);
        $workspace = $request->user()->currentWorkspace();
        $token = config('camlink.api_key_prefix').Str::random(48);
        $key = ApiKey::create([
            'workspace_id' => $workspace->id,
            'created_by' => $request->user()->id,
            'name' => $input['name'],
            'key_prefix' => substr($token, 0, 20),
            'key_hash' => hash('sha256', $token),
            'abilities' => ['affiliate:convert', 'affiliate:reports'],
            'expires_at' => $input['expires_at'] ?? null,
        ]);

        return response()->json(['success' => true, 'data' => [
            'id' => $key->id,
            'name' => $key->name,
            'key_prefix' => $key->key_prefix,
            'key' => $token,
            'created_at' => $key->created_at,
            'notice' => 'API key chỉ hiển thị một lần. Hãy lưu lại ngay.',
        ]], 201);
    }

    public function destroy(Request $request, int $apiKey): JsonResponse
    {
        $key = $request->user()->currentWorkspace()->apiKeys()->whereKey($apiKey)->whereNull('revoked_at')->firstOrFail();
        $key->update(['revoked_at' => now()]);

        return response()->json(['success' => true]);
    }
}
