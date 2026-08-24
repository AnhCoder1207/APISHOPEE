<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ConversionRecord extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'purchase_time' => 'datetime',
            'last_synced_at' => 'datetime',
            'payload' => 'array',
        ];
    }
}
