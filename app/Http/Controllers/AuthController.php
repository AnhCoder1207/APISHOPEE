<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Workspace;
use App\Services\WorkspaceService;
use App\Support\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function register(Request $request, WorkspaceService $workspaces)
    {
        $json = $request->is('api/*') || $request->expectsJson();
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80'],
            'email' => ['required', 'email:rfc', 'max:254', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(10)],
            'terms' => ['accepted'],
        ]);

        [$user, $workspace] = DB::transaction(function () use ($data, $workspaces) {
            $user = User::create([
                'name' => trim($data['name']),
                'email' => strtolower(trim($data['email'])),
                'password' => $data['password'],
                'status' => 'active',
            ]);

            return [$user, $workspaces->createForUser($user)];
        });
        Auth::login($user);
        $request->session()->regenerate();

        if ($json) {
            return response()->json(['success' => true, 'data' => $this->userData($user, $workspace)], 201);
        }

        return redirect()->route('dashboard')->with('status', 'Tài khoản đã được tạo.');
    }

    public function login(Request $request, WorkspaceService $workspaces)
    {
        $json = $request->is('api/*') || $request->expectsJson();
        $data = $request->validate([
            'email' => ['required', 'email:rfc'],
            'password' => ['required', 'string'],
        ]);
        $email = strtolower(trim($data['email']));
        $key = 'login:'.Str::lower($request->ip()).':'.$email;
        if (RateLimiter::tooManyAttempts($key, 10)) {
            if ($json) {
                throw new ApiException('TOO_MANY_LOGIN_ATTEMPTS', 'Đăng nhập tạm khóa. Vui lòng thử lại sau.', 429);
            }

            return back()->withErrors(['email' => 'Đăng nhập tạm khóa. Vui lòng thử lại sau.'])->onlyInput('email');
        }

        if (! Auth::attempt(['email' => $email, 'password' => $data['password'], 'status' => 'active'])) {
            RateLimiter::hit($key, 900);
            if ($json) {
                throw new ApiException('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.', 401);
            }

            return back()->withErrors(['email' => 'Email hoặc mật khẩu không đúng.'])->onlyInput('email');
        }

        RateLimiter::clear($key);
        $request->session()->regenerate();
        $workspace = $workspaces->forUser($request->user());
        if ($json) {
            return response()->json(['success' => true, 'data' => $this->userData($request->user(), $workspace)]);
        }

        return redirect()->intended(route('dashboard'));
    }

    public function me(Request $request, WorkspaceService $workspaces)
    {
        $user = $request->user();

        return response()->json(['success' => true, 'data' => $this->userData($user, $workspaces->forUser($user))]);
    }

    public function logout(Request $request)
    {
        $json = $request->is('api/*') || $request->expectsJson();
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($json) {
            return response()->json(['success' => true]);
        }

        return redirect()->route('home');
    }

    private function userData(User $user, Workspace $workspace): array
    {
        return [
            'user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'is_admin' => $user->is_admin],
            'workspace' => ['id' => $workspace->id, 'name' => $workspace->name, 'role' => $workspace->pivot?->role ?? 'owner'],
        ];
    }
}
