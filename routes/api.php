<?php

use App\Http\Controllers\Api\ApiKeyController;
use App\Http\Controllers\Api\ConnectionController;
use App\Http\Controllers\Api\ConversionReportController;
use App\Http\Controllers\Api\ConvertLinkController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\UsageController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class)->name('api.health');
Route::get('/health/ready', [HealthController::class, 'ready'])->name('api.health.ready');

Route::middleware(['web', 'auth:web', 'active', 'workspace.active'])->prefix('app')->group(function () {
    Route::get('/connections', [ConnectionController::class, 'index']);
    Route::post('/connections', [ConnectionController::class, 'store']);
    Route::patch('/connections/{connection}', [ConnectionController::class, 'update']);
    Route::post('/connections/{connection}/check', [ConnectionController::class, 'check']);
    Route::delete('/connections/{connection}', [ConnectionController::class, 'destroy']);
    Route::get('/api-keys', [ApiKeyController::class, 'index']);
    Route::post('/api-keys', [ApiKeyController::class, 'store']);
    Route::delete('/api-keys/{apiKey}', [ApiKeyController::class, 'destroy']);
    Route::get('/usage', UsageController::class);
});

Route::middleware(['api.key', 'throttle:camlink-api'])->group(function () {
    Route::prefix('v1/affiliate')->group(function () {
        Route::post('/convert-link', ConvertLinkController::class)->name('api.v1.convert-link');
        Route::post('/conversion-reports', ConversionReportController::class)->name('api.v1.conversion-reports');
    });

    // Compatibility paths for clients using the original Node API.
    Route::prefix('affiliate')->group(function () {
        Route::post('/convert-link', ConvertLinkController::class);
        Route::post('/conversion-reports', ConversionReportController::class);
    });

    Route::get('/v1/usage', UsageController::class)->name('api.v1.usage');
});
