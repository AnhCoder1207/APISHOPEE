<?php

namespace App\Http\Middleware;

use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureWorkspaceActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $workspace = $request->user()?->currentWorkspace();
        if (! $workspace || $workspace->status !== 'active') {
            if ($request->is('api/*')) {
                throw new ApiException('WORKSPACE_SUSPENDED', 'Workspace đang bị tạm khóa.', 403);
            }
            abort(403, 'Workspace đang bị tạm khóa.');
        }

        return $next($request);
    }
}
