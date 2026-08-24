<?php

namespace Tests\Unit;

use App\Services\Shopee\ShopeeCookieParser;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class ShopeeCookieParserTest extends TestCase
{
    public function test_it_filters_a_cookie_export_to_shopee_affiliate_cookies(): void
    {
        $json = json_encode([
            ['domain' => '.shopee.vn', 'name' => 'SPC_ST', 'value' => 'secret-st', 'path' => '/'],
            ['domain' => '.shopee.vn', 'name' => 'SPC_U', 'value' => '123', 'path' => '/'],
            ['domain' => '.example.com', 'name' => 'OTHER', 'value' => 'ignored', 'path' => '/'],
        ], JSON_THROW_ON_ERROR);

        $result = (new ShopeeCookieParser)->parseExport($json);

        $this->assertSame(2, $result['cookieCount']);
        $this->assertStringContainsString('SPC_ST=secret-st', $result['cookieHeader']);
        $this->assertStringNotContainsString('OTHER', $result['cookieHeader']);
    }

    public function test_it_rejects_exports_without_required_auth_cookies(): void
    {
        $this->expectException(InvalidArgumentException::class);

        (new ShopeeCookieParser)->parseExport(json_encode([
            ['domain' => '.shopee.vn', 'name' => 'SPC_U', 'value' => '123'],
        ], JSON_THROW_ON_ERROR));
    }
}
