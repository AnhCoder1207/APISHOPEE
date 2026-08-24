<?php

use App\Http\Middleware\ApplySecurityHeaders;
use App\Http\Middleware\AttachRequestId;
use App\Http\Middleware\AuthenticateApiKey;
use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureWorkspaceActive;
use App\Support\ApiException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands([__DIR__.'/../app/Console/Commands'])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(ApplySecurityHeaders::class);
        $middleware->api(prepend: [AttachRequestId::class]);
        $middleware->alias([
            'api.key' => AuthenticateApiKey::class,
            'active' => EnsureActiveUser::class,
            'workspace.active' => EnsureWorkspaceActive::class,
            'admin' => EnsureAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(function (ApiException $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'success' => false,
                'error' => [
                    'code' => $exception->errorCode,
                    'message' => $exception->getMessage(),
                    'details' => $exception->details ?: null,
                    'request_id' => $request->attributes->get('request_id'),
                ],
            ], $exception->status);
        });

        $exceptions->render(function (ValidationException $exception, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'success' => false,
                'error' => [
                    'code' => 'VALIDATION_ERROR',
                    'message' => 'Dữ liệu gửi lên chưa hợp lệ.',
                    'issues' => $exception->errors(),
                    'request_id' => $request->attributes->get('request_id'),
                ],
            ], 422);
        });

        $exceptions->render(function (Throwable $exception, Request $request) {
            if (! $request->is('api/*') || $exception instanceof ApiException || $exception instanceof ValidationException) {
                return null;
            }

            $status = method_exists($exception, 'getStatusCode') ? $exception->getStatusCode() : 500;
            $status = $status >= 400 && $status <= 599 ? $status : 500;

            return response()->json([
                'success' => false,
                'error' => [
                    'code' => match ($status) {
                        401 => 'UNAUTHENTICATED',
                        403 => 'FORBIDDEN',
                        404 => 'NOT_FOUND',
                        419 => 'CSRF_TOKEN_MISMATCH',
                        429 => 'RATE_LIMITED',
                        default => 'INTERNAL_SERVER_ERROR',
                    },
                    'message' => $status === 500 ? 'Đã xảy ra lỗi máy chủ.' : $exception->getMessage(),
                    'request_id' => $request->attributes->get('request_id'),
                ],
            ], $status);
        });
    })->create();
