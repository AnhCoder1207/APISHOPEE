<?php

namespace App\Services\Shopee;

use InvalidArgumentException;

class ShopeeCookieParser
{
    private const REQUIRED = ['SPC_ST', 'SPC_U'];

    private const MAX_BYTES = 512000;

    private const MAX_COUNT = 200;

    private const TARGET_HOST = 'affiliate.shopee.vn';

    /** @return array{cookieHeader: string, cookieCount: int} */
    public function parseExport(string $json): array
    {
        if (strlen($json) > self::MAX_BYTES) {
            throw new InvalidArgumentException('File cookie lớn hơn 500 KB. Hãy chỉ xuất cookie của affiliate.shopee.vn rồi chọn lại file.');
        }

        try {
            $root = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new InvalidArgumentException('File bạn chọn không phải file cookie JSON hợp lệ. Hãy xuất lại cookie từ affiliate.shopee.vn rồi chọn file mới.');
        }

        $cookies = is_array($root) && array_is_list($root) ? $root : ($root['cookies'] ?? null);
        if (! is_array($cookies) || $cookies === [] || count($cookies) > self::MAX_COUNT) {
            throw new InvalidArgumentException('File này không có danh sách cookie Shopee. Hãy đăng nhập affiliate.shopee.vn rồi xuất lại file JSON.');
        }

        $selected = [];
        $expiredRequired = [];
        $now = time();
        foreach ($cookies as $cookie) {
            if (! is_array($cookie)) {
                continue;
            }

            $domain = strtolower(ltrim((string) ($cookie['domain'] ?? ''), '.'));
            $hostOnly = ($cookie['hostOnly'] ?? false) === true;
            $matches = $domain !== '' && ($domain === 'shopee.vn' || str_ends_with($domain, '.shopee.vn'))
                && (! $hostOnly || $domain === self::TARGET_HOST);
            if (! $matches) {
                continue;
            }

            $name = trim((string) ($cookie['name'] ?? ''));
            $value = (string) ($cookie['value'] ?? '');
            $expires = $cookie['expirationDate'] ?? null;
            if ($expires !== null && $expires !== '' && is_numeric($expires) && (float) $expires <= $now) {
                if (in_array($name, self::REQUIRED, true)) {
                    $expiredRequired[] = $name;
                }

                continue;
            }
            if ($name === '' || $value === '' || ! preg_match("/^[!#\$%&'*+\-.^_`|~0-9A-Za-z]+$/", $name)) {
                continue;
            }
            if (preg_match('/[;\x00-\x1F\x7F]/', $value)) {
                continue;
            }

            $selected[$name] = $value;
        }

        $missing = array_values(array_diff(self::REQUIRED, array_keys($selected)));
        if ($missing !== []) {
            if ($expiredRequired !== []) {
                throw new InvalidArgumentException('File cookie này đã hết phiên đăng nhập Shopee. Hãy đăng nhập lại affiliate.shopee.vn, xuất file mới rồi tải lên Camlink.');
            }

            throw new InvalidArgumentException('File cookie này chưa chứa phiên đăng nhập Shopee Affiliate. Hãy đăng nhập affiliate.shopee.vn trước khi xuất file.');
        }

        $header = collect($selected)->map(fn (string $value, string $name) => "{$name}={$value}")->implode('; ');
        if (strlen($header) > 32000) {
            throw new InvalidArgumentException('File cookie chứa quá nhiều dữ liệu. Hãy xuất lại cookie riêng cho affiliate.shopee.vn.');
        }

        return ['cookieHeader' => $header, 'cookieCount' => count($selected)];
    }
}
