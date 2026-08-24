<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ShopeeConnection extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'workspace_id', 'created_by', 'name', 'encrypted_cookie', 'status', 'is_default',
        'affiliate_id', 'affiliate_name', 'last_checked_at', 'last_error_code',
    ];

    protected $hidden = ['encrypted_cookie'];

    protected function casts(): array
    {
        return [
            'encrypted_cookie' => 'encrypted',
            'is_default' => 'boolean',
            'last_checked_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
