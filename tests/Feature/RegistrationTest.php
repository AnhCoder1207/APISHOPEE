<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_register_and_receives_a_workspace(): void
    {
        $response = $this->post('/register', [
            'name' => 'Camlink User',
            'email' => 'user@example.com',
            'password' => 'very-secure-password',
            'password_confirmation' => 'very-secure-password',
            'terms' => '1',
        ]);

        $response->assertRedirect('/dashboard');
        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['email' => 'user@example.com', 'status' => 'active']);
        $this->assertDatabaseHas('workspaces', ['plan' => 'starter', 'monthly_quota' => 2000]);
        $this->assertDatabaseHas('workspace_user', ['role' => 'owner']);
    }

    public function test_registration_requires_accepting_terms(): void
    {
        $this->post('/register', [
            'name' => 'Camlink User',
            'email' => 'terms@example.com',
            'password' => 'very-secure-password',
            'password_confirmation' => 'very-secure-password',
        ])->assertSessionHasErrors('terms');

        $this->assertGuest();
        $this->assertDatabaseMissing('users', ['email' => 'terms@example.com']);
    }
}
