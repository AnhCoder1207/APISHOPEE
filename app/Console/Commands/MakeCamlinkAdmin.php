<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class MakeCamlinkAdmin extends Command
{
    protected $signature = 'camlink:make-admin {email}';

    protected $description = 'Grant Camlink system admin access to a registered user';

    public function handle(): int
    {
        $user = User::where('email', strtolower(trim($this->argument('email'))))->first();
        if (! $user) {
            $this->error('Không tìm thấy tài khoản.');

            return self::FAILURE;
        }
        $user->update(['is_admin' => true, 'status' => 'active']);
        $this->info("Đã cấp quyền admin cho {$user->email}.");

        return self::SUCCESS;
    }
}
