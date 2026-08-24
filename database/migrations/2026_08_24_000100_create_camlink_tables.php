<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspaces', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->foreignId('owner_user_id')->constrained('users');
            $table->string('plan')->default('starter')->index();
            $table->unsignedInteger('monthly_quota')->default(2000);
            $table->string('status')->default('active')->index();
            $table->timestamps();
        });

        Schema::create('workspace_user', function (Blueprint $table) {
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role')->default('member');
            $table->timestamps();
            $table->primary(['workspace_id', 'user_id']);
        });

        Schema::create('shopee_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('name');
            $table->longText('encrypted_cookie');
            $table->string('status')->default('connected')->index();
            $table->boolean('is_default')->default(false);
            $table->string('affiliate_id')->nullable();
            $table->string('affiliate_name')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->string('last_error_code')->nullable();
            $table->softDeletes();
            $table->timestamps();
            $table->index(['workspace_id', 'is_default']);
        });

        Schema::create('api_keys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('name');
            $table->string('key_prefix', 24)->index();
            $table->char('key_hash', 64)->unique();
            $table->json('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('link_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('shopee_connection_id')->constrained()->restrictOnDelete();
            $table->string('sub_id_1')->default('');
            $table->string('sub_id_2')->default('');
            $table->string('sub_id_3')->default('');
            $table->string('sub_id_4')->default('');
            $table->string('sub_id_5')->default('');
            $table->unsignedTinyInteger('item_count');
            $table->timestamps();
        });

        Schema::create('link_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('link_batches')->cascadeOnDelete();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->text('original_link');
            $table->text('short_link')->nullable();
            $table->text('long_link')->nullable();
            $table->integer('fail_code')->default(-1);
            $table->timestamps();
            $table->index(['workspace_id', 'created_at']);
        });

        Schema::create('conversion_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shopee_connection_id')->constrained()->restrictOnDelete();
            $table->string('checkout_id');
            $table->timestamp('purchase_time')->nullable();
            $table->integer('conversion_status')->default(0);
            $table->string('source')->default('');
            $table->unsignedInteger('order_count')->default(0);
            $table->decimal('order_value_internal', 30, 0)->default(0);
            $table->decimal('estimated_commission_internal', 30, 0)->default(0);
            $table->json('payload');
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();
            $table->unique(['shopee_connection_id', 'checkout_id']);
            $table->index(['workspace_id', 'purchase_time']);
        });

        Schema::create('usage_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('api_key_id')->nullable()->constrained('api_keys')->nullOnDelete();
            $table->uuid('request_id')->index();
            $table->string('event_type')->index();
            $table->unsignedSmallInteger('status_code');
            $table->unsignedInteger('units')->default(1);
            $table->boolean('billable')->default(true);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'created_at']);
        });

        Schema::create('admin_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_email');
            $table->string('action')->index();
            $table->string('target_type');
            $table->unsignedBigInteger('target_id')->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_audit_logs');
        Schema::dropIfExists('usage_events');
        Schema::dropIfExists('conversion_records');
        Schema::dropIfExists('link_results');
        Schema::dropIfExists('link_batches');
        Schema::dropIfExists('api_keys');
        Schema::dropIfExists('shopee_connections');
        Schema::dropIfExists('workspace_user');
        Schema::dropIfExists('workspaces');
    }
};
