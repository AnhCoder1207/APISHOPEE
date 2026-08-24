<?php

namespace App\Http\Middleware;

use App\Models\ApiKey;
use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        $prefix = config('camlink.api_key_prefix');
        if (! $token || ! str_starts_with($token, $prefix)) {
            throw new ApiException('INVALID_API_KEY', 'API key không hợp lệ hoặc bị thiếu.', 401);
        }

        $apiKey = ApiKey::query()
            ->with(['workspace', 'creator'])
            ->where('key_hash', hash('sha256', $token))
            ->whereNull('revoked_at')
            ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->first();

        if (! $apiKey || $apiKey->workspace?->status !== 'active' || $apiKey->creator?->status !== 'active') {
            throw new ApiException('INVALID_API_KEY', 'API key không hợp lệ hoặc đã bị thu hồi.', 401);
        }

        $request->attributes->set('api_key', $apiKey);
        $request->attributes->set('workspace', $apiKey->workspace);
        $request->setUserResolver(fn () => $apiKey->creator);

        $response = $next($request);
        $apiKey->forceFill(['last_used_at' => now()])->saveQuietly();

        return $response;
    }
}
