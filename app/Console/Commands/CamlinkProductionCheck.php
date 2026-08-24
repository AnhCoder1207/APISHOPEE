<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CamlinkProductionCheck extends Command
{
    protected $signature = 'camlink:production-check';

    protected $description = 'Check the Camlink environment before a production deployment';

    public function handle(): int
    {
        $checks = [
            ['PHP >= 8.3', version_compare(PHP_VERSION, '8.3.0', '>='), PHP_VERSION],
            ['pdo_mysql', extension_loaded('pdo_mysql'), extension_loaded('pdo_mysql') ? 'loaded' : 'missing'],
            ['APP_KEY', filled(config('app.key')), filled(config('app.key')) ? 'configured' : 'missing'],
            ['APP_ENV', app()->environment('production'), app()->environment()],
            ['APP_DEBUG', ! config('app.debug'), config('app.debug') ? 'true' : 'false'],
            ['APP_URL HTTPS', str_starts_with(config('app.url'), 'https://'), config('app.url')],
            ['Database driver', DB::getDriverName() === 'mysql', DB::getDriverName()],
            ['Session encryption', (bool) config('session.encrypt'), config('session.encrypt') ? 'enabled' : 'disabled'],
            ['Mail transport', config('mail.default') !== 'log', (string) config('mail.default')],
        ];

        try {
            DB::select('select 1');
            $checks[] = ['Database connection', true, 'connected'];
        } catch (\Throwable $exception) {
            $checks[] = ['Database connection', false, $exception->getMessage()];
        }

        $failed = false;
        foreach ($checks as [$label, $passed, $detail]) {
            $failed = $failed || ! $passed;
            $this->line(sprintf('%s %-22s %s', $passed ? '<fg=green>PASS</>' : '<fg=red>FAIL</>', $label, $detail));
        }

        if ($failed) {
            $this->newLine();
            $this->error('Production check failed. Update the environment before deploying.');

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Camlink is ready for production deployment.');

        return self::SUCCESS;
    }
}
