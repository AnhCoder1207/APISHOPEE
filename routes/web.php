<?php

use App\Http\Controllers\Api\DocsController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PasswordResetController;
use App\Http\Controllers\Web\AdminController;
use App\Http\Controllers\Web\AffiliateToolsController;
use App\Http\Controllers\Web\DashboardController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => view('welcome'))->name('home');
Route::get('/openapi.json', [DocsController::class, 'openapi'])->name('openapi');
Route::get('/docs', [DocsController::class, 'docs'])->name('docs');
Route::view('/terms', 'legal.terms')->name('legal.terms');
Route::view('/privacy', 'legal.privacy')->name('legal.privacy');
Route::middleware('guest')->group(function () {
    Route::get('/login', fn () => view('auth.login'))->name('login');
    Route::get('/register', fn () => view('auth.register'))->name('register');
    Route::post('/login', [AuthController::class, 'login'])->name('login.store');
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:6,1')->name('register.store');
    Route::get('/forgot-password', [PasswordResetController::class, 'requestForm'])->name('password.request');
    Route::post('/forgot-password', [PasswordResetController::class, 'sendLink'])->middleware('throttle:5,1')->name('password.email');
    Route::get('/reset-password/{token}', [PasswordResetController::class, 'resetForm'])->name('password.reset');
    Route::post('/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:6,1')->name('password.update');
});
Route::middleware(['auth', 'active', 'workspace.active'])->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::get('/tools/convert-link', [AffiliateToolsController::class, 'convertLink'])->name('tools.convert-link');
    Route::post('/tools/convert-link', [AffiliateToolsController::class, 'convertLink'])->middleware('throttle:camlink-web-tools')->name('tools.convert-link.store');
    Route::get('/tools/conversion-reports', [AffiliateToolsController::class, 'reports'])->name('tools.conversion-reports');
    Route::get('/tools/conversion-reports/export', [AffiliateToolsController::class, 'exportReports'])->middleware('throttle:camlink-web-export')->name('tools.conversion-reports.export');
    Route::post('/tools/conversion-reports/sync', [AffiliateToolsController::class, 'syncReports'])->middleware('throttle:camlink-web-tools')->name('tools.conversion-reports.sync');
    Route::post('/dashboard/connections', [DashboardController::class, 'storeConnection'])->name('dashboard.connections.store');
    Route::patch('/dashboard/connections/{connection}', [DashboardController::class, 'updateConnection'])->middleware('throttle:camlink-web-tools')->name('dashboard.connections.update');
    Route::post('/dashboard/connections/{connection}/check', [DashboardController::class, 'checkConnection'])->name('dashboard.connections.check');
    Route::delete('/dashboard/connections/{connection}', [DashboardController::class, 'destroyConnection'])->name('dashboard.connections.destroy');
    Route::post('/dashboard/api-keys', [DashboardController::class, 'createApiKey'])->name('dashboard.api-keys.store');
    Route::delete('/dashboard/api-keys/{apiKey}', [DashboardController::class, 'revokeApiKey'])->name('dashboard.api-keys.destroy');
});
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth')->name('logout');
Route::middleware(['auth', 'active', 'admin'])->prefix('admin')->group(function () {
    Route::get('/', [AdminController::class, 'index'])->name('admin.index');
    Route::patch('/users/{user}', [AdminController::class, 'updateUser'])->name('admin.users.update');
    Route::patch('/workspaces/{workspace}', [AdminController::class, 'updateWorkspace'])->name('admin.workspaces.update');
});
