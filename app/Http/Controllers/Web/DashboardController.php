<?php

namespace App\Http\Controllers\Web;

use App\Models\ApiKey;
use App\Models\ShopeeConnection;
use App\Services\Shopee\ShopeeConnectionService;
use App\Services\UsageService;
use App\Support\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DashboardController
{
    public function index(Request $request)
    {
        $workspace = $request->user()->currentWorkspace();

        return view('dashboard.index', [
            'workspace' => $workspace,
            'connections' => $workspace->connections()->latest()->get(),
            'apiKeys' => $workspace->apiKeys()->whereNull('revoked_at')->latest()->get(),
            'usage' => app(UsageService::class)->summary($workspace),
        ]);
    }

    public function storeConnection(Request $request, ShopeeConnectionService $connections)
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80'],
            'cookie_json' => ['nullable', 'string', 'min:2', 'max:512000', 'required_without:cookie_file'],
            'cookie_file' => ['nullable', 'file', 'mimes:json,txt', 'max:500', 'required_without:cookie_json'],
            'is_default' => ['nullable', 'boolean'],
        ]);
        if ($request->hasFile('cookie_file')) {
            $input['cookie_json'] = $request->file('cookie_file')->getContent();
        }
        $workspace = $request->user()->currentWorkspace();
        try {
            $connection = $connections->create($request->user(), $workspace, $input);
        } catch (ApiException $exception) {
            return back()->withErrors(['cookie_json' => $exception->getMessage()])->withInput($request->except('cookie_json'));
        }

        return back()->with('status', "Đã kết nối {$connection->name} với Shopee. Bạn có thể tạo API key và bắt đầu sử dụng.");
    }

    public function createApiKey(Request $request)
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80'],
            'expires_at' => ['nullable', 'date', 'after:today'],
        ]);
        $token = config('camlink.api_key_prefix').Str::random(48);
        $key = ApiKey::create([
            'workspace_id' => $request->user()->currentWorkspace()->id,
            'created_by' => $request->user()->id,
            'name' => $input['name'],
            'key_prefix' => substr($token, 0, 20),
            'key_hash' => hash('sha256', $token),
            'abilities' => ['affiliate:convert', 'affiliate:reports'],
            'expires_at' => $input['expires_at'] ?? null,
        ]);

        return back()->with('new_api_key', $token)->with('status', "Đã tạo API key {$key->name}.");
    }

    public function revokeApiKey(Request $request, int $apiKey)
    {
        $request->user()->currentWorkspace()->apiKeys()->whereKey($apiKey)->update(['revoked_at' => now()]);

        return back()->with('status', 'Đã thu hồi API key.');
    }

    public function checkConnection(Request $request, int $connection, ShopeeConnectionService $connections)
    {
        $model = $request->user()->currentWorkspace()->connections()->whereKey($connection)->firstOrFail();

        try {
            $connections->check($model);
        } catch (ApiException $exception) {
            return back()->withErrors(['connection' => $exception->getMessage()]);
        }

        return back()->with('status', "Kết nối {$model->name} đang hoạt động tốt.");
    }

    public function updateConnection(Request $request, int $connection, ShopeeConnectionService $connections)
    {
        $workspace = $request->user()->currentWorkspace();
        /** @var ShopeeConnection $model */
        $model = $workspace->connections()->whereKey($connection)->firstOrFail();
        $input = $request->validate([
            'name' => ['nullable', 'string', 'min:2', 'max:80'],
            'cookie_json' => ['nullable', 'string', 'min:2', 'max:512000'],
            'cookie_file' => ['nullable', 'file', 'mimes:json,txt', 'max:500'],
            'is_default' => ['nullable', 'boolean'],
        ]);
        if ($request->hasFile('cookie_file')) {
            $input['cookie_json'] = $request->file('cookie_file')->getContent();
        }

        try {
            $updated = $connections->update($model, $workspace, $input);
        } catch (ApiException $exception) {
            return back()->withErrors(['connection' => $exception->getMessage()]);
        }

        return back()->with('status', "Đã cập nhật kết nối {$updated->name}. Camlink đã kiểm tra phiên mới với Shopee.");
    }

    public function destroyConnection(Request $request, int $connection)
    {
        $workspace = $request->user()->currentWorkspace();
        /** @var ShopeeConnection $model */
        $model = $workspace->connections()->whereKey($connection)->firstOrFail();
        $wasDefault = $model->is_default;
        $name = $model->name;
        $model->delete();

        if ($wasDefault) {
            $workspace->connections()->oldest()->first()?->update(['is_default' => true]);
        }

        return back()->with('status', "Đã xoá kết nối {$name}.");
    }
}
