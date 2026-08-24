<?php

namespace App\Http\Middleware;

use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->is_admin) {
            if ($request->is('api/*')) {
                throw new ApiException('ADMIN_REQUIRED', 'Bạn không có quyền quản trị.', 403);
            }
            abort(403);
        }

        return $next($request);
    }
}
