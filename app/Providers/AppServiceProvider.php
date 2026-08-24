<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('camlink-api', function (Request $request) {
            $key = $request->attributes->get('api_key');

            return Limit::perMinute(config('camlink.api_rate_limit'))->by($key?->id ?: $request->ip());
        });

        RateLimiter::for('camlink-web-tools', function (Request $request) {
            $workspace = $request->user()?->currentWorkspace();

            return Limit::perMinute(20)->by($workspace ? 'workspace:'.$workspace->id : 'ip:'.$request->ip());
        });

        RateLimiter::for('camlink-web-export', function (Request $request) {
            $workspace = $request->user()?->currentWorkspace();

            return Limit::perMinute(10)->by($workspace ? 'workspace:'.$workspace->id : 'ip:'.$request->ip());
        });
    }
}
