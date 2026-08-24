<?php

namespace App\Http\Controllers\Web;

use App\Models\AdminAuditLog;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminController
{
    public function index()
    {
        return view('admin.index', [
            'metrics' => [
                'users' => User::count(),
                'active_users' => User::where('status', 'active')->count(),
                'workspaces' => Workspace::count(),
                'connections' => DB::table('shopee_connections')->whereNull('deleted_at')->count(),
                'api_keys' => DB::table('api_keys')->whereNull('revoked_at')->count(),
                'usage_month' => DB::table('usage_events')->where('created_at', '>=', now()->startOfMonth())->sum('units'),
            ],
            'users' => User::latest()->limit(50)->get(),
            'workspaces' => Workspace::with('owner')->latest()->limit(50)->get(),
            'auditLogs' => AdminAuditLog::latest()->limit(30)->get(),
        ]);
    }

    public function updateUser(Request $request, int $user)
    {
        $data = $request->validate(['status' => ['required', 'in:active,suspended']]);
        $model = User::findOrFail($user);
        abort_if($model->is($request->user()), 409, 'Không thể tự khóa tài khoản admin hiện tại.');
        $model->update(['status' => $data['status']]);
        if ($data['status'] === 'suspended') {
            DB::table('sessions')->where('user_id', $model->id)->delete();
        }
        $this->audit($request, 'user.update', 'user', $model->id, ['status' => $data['status']]);

        return back()->with('status', "Đã cập nhật người dùng {$model->email}.");
    }

    public function updateWorkspace(Request $request, int $workspace)
    {
        $data = $request->validate([
            'status' => ['required', 'in:active,suspended'],
            'monthly_quota' => ['required', 'integer', 'min:0', 'max:10000000'],
        ]);
        $model = Workspace::findOrFail($workspace);
        $model->update($data);
        $this->audit($request, 'workspace.update', 'workspace', $model->id, $data);

        return back()->with('status', "Đã cập nhật workspace {$model->name}.");
    }

    private function audit(Request $request, string $action, string $targetType, int $targetId, array $metadata): void
    {
        AdminAuditLog::create([
            'actor_user_id' => $request->user()->id,
            'actor_email' => $request->user()->email,
            'action' => $action,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'metadata' => $metadata,
            'ip_hash' => hash('sha256', $request->ip()),
        ]);
    }
}
