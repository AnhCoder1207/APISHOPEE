<?php

namespace App\Services\Shopee;

use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;

class ShopeeAffiliateClient
{
    private const HOSTS = ['shopee.vn', 's.shopee.vn', 'shope.ee'];

    private const CLIENT_HINT = '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"';

    public function convertLinks(string $cookie, array $input): Response
    {
        $links = $input['original_links'];
        $this->validateLinks($links);
        $base = rtrim(config('camlink.shopee_base_api'), '/');
        $endpoint = str_contains($base, '/gql') ? $base : $base.'/gql?q=batchCustomLink';
        $params = array_map(fn (string $link) => [
            'originalLink' => $link,
            'advancedLinkParams' => [
                'subId1' => $input['sub_id_1'] ?? '',
                'subId2' => $input['sub_id_2'] ?? '',
                'subId3' => $input['sub_id_3'] ?? '',
                'subId4' => $input['sub_id_4'] ?? '',
                'subId5' => $input['sub_id_5'] ?? '',
            ],
        ], array_slice($links, 0, 5));

        return $this->request($cookie)->post($endpoint, [
            'operationName' => 'batchGetCustomLink',
            'query' => 'query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller) { batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) { shortLink longLink failCode } }',
            'variables' => ['linkParams' => $params, 'sourceCaller' => 'CUSTOM_LINK_CALLER'],
        ]);
    }

    public function conversionReports(string $cookie, array $input): Response
    {
        $start = $this->dateToTimestamp($input['start_date'], false);
        $end = $this->dateToTimestamp($input['end_date'], true);
        if ($start > $end) {
            throw new InvalidArgumentException('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
        }

        $base = rtrim(config('camlink.shopee_base_api'), '/');
        $endpoint = str_ends_with($base, '/report/list') ? $base : $base.'/report/list';
        $query = [
            'page_num' => $input['page'],
            'page_size' => $input['limit'],
            'purchase_time_s' => $start,
            'purchase_time_e' => $end,
            'version' => 1,
        ];
        if (! empty($input['order_id'])) {
            $query['order_sn'] = trim($input['order_id']);
        }
        if (isset($input['status'])) {
            $query['order_status'] = $input['status'];
        }

        return $this->request($cookie)->get($endpoint, $query);
    }

    public function validateLinks(array $links): void
    {
        foreach ($links as $link) {
            $parts = parse_url($link);
            $host = strtolower((string) ($parts['host'] ?? ''));
            if (($parts['scheme'] ?? '') !== 'https' || ! in_array($host, self::HOSTS, true) && ! str_ends_with($host, '.shopee.vn')) {
                throw new InvalidArgumentException('Chỉ chấp nhận đường dẫn HTTPS thuộc Shopee.');
            }
        }
    }

    public function isAuthError(Response $response): bool
    {
        $json = $response->json();
        if (! is_array($json)) {
            return in_array($response->status(), [401, 403], true);
        }

        if (($json['is_login'] ?? null) === true) {
            return false;
        }

        $error = data_get($json, 'error');
        $errorCode = data_get($json, 'error_code') ?? data_get($json, 'data.error_code');
        $code = data_get($json, 'code')
            ?? data_get($json, 'data.code')
            ?? data_get($json, 'errors.0.extensions.code');

        return in_array($response->status(), [401, 403], true)
            || in_array((string) $error, ['401', '403', '90309999'], true)
            || in_array((string) $errorCode, ['401', '403', '90309999'], true)
            || in_array((string) $code, ['401', '403', '90309999'], true)
            || ($json['is_login'] ?? null) === false;
    }

    /**
     * Validate both the HTTP envelope and Shopee's application-level response.
     * Shopee occasionally returns HTTP 200 for an unsuccessful request.
     */
    public function payload(Response $response, string $expectedPath, bool $allowNull = false): array
    {
        if ($this->isAuthError($response)) {
            throw new ApiException(
                'SHOPEE_SESSION_EXPIRED',
                'Phiên đăng nhập Shopee đã hết hạn. Hãy đăng nhập lại affiliate.shopee.vn, xuất file cookie mới rồi cập nhật kết nối trên Camlink.',
                422,
            );
        }

        if ($response->failed()) {
            throw new ApiException('SHOPEE_UPSTREAM_ERROR', $this->upstreamErrorMessage($response), 502);
        }

        $payload = $response->json();
        if (! is_array($payload)) {
            throw new ApiException('SHOPEE_INVALID_RESPONSE', 'Camlink nhận được phản hồi không hợp lệ từ Shopee. Vui lòng thử lại.', 502);
        }

        $errors = data_get($payload, 'errors');
        if (is_array($errors) && count($errors) > 0) {
            throw new ApiException('SHOPEE_REQUEST_REJECTED', 'Shopee không xử lý được yêu cầu này. Vui lòng kiểm tra dữ liệu rồi thử lại.', 502);
        }

        $error = data_get($payload, 'error') ?? data_get($payload, 'error_code');
        if ($error !== null && ! in_array((string) $error, ['', '0'], true)) {
            throw new ApiException('SHOPEE_REQUEST_REJECTED', $this->upstreamErrorMessage($response), 502);
        }

        $code = data_get($payload, 'code');
        if ($code !== null && (string) $code !== '0') {
            throw new ApiException('SHOPEE_REQUEST_REJECTED', 'Shopee không xử lý được yêu cầu này. Vui lòng thử lại sau ít phút.', 502);
        }

        $data = data_get($payload, $expectedPath);
        if ($allowNull && $data === null) {
            data_set($payload, $expectedPath, []);

            return $payload;
        }
        if (! is_array($data)) {
            throw new ApiException('SHOPEE_INVALID_RESPONSE', 'Camlink nhận được phản hồi chưa đầy đủ từ Shopee. Vui lòng thử lại.', 502);
        }

        return $payload;
    }

    public function upstreamErrorMessage(Response $response): string
    {
        if ($this->isAuthError($response)) {
            return 'Shopee không chấp nhận phiên đăng nhập đang lưu. Hãy đăng nhập lại affiliate.shopee.vn, xuất file cookie mới rồi cập nhật kết nối trên Camlink.';
        }

        if ($response->json('is_login') === true) {
            return 'Shopee vẫn nhận ra tài khoản nhưng chưa chấp nhận yêu cầu tạo link này. Vui lòng thử lại sau ít phút.';
        }

        return 'Shopee đang tạm thời không nhận yêu cầu từ Camlink. Vui lòng thử lại sau ít phút.';
    }

    public function extractAffiliate(Response $response): array
    {
        $list = $response->json('data.list', []);
        $first = is_array($list) && is_array($list[0] ?? null) ? $list[0] : [];

        return [
            'affiliate_id' => isset($first['affiliate_id']) ? (string) $first['affiliate_id'] : null,
            'affiliate_name' => isset($first['affiliate_name']) ? (string) $first['affiliate_name'] : null,
        ];
    }

    private function request(string $cookie)
    {
        $options = [];
        if (filled(config('camlink.shopee_ca_bundle'))) {
            $options['verify'] = config('camlink.shopee_ca_bundle');
        }

        return Http::withOptions($options)
            ->timeout(config('camlink.shopee_timeout'))
            ->connectTimeout(8)
            ->acceptJson()
            ->withHeaders([
                'Content-Type' => 'application/json',
                'Cookie' => $cookie,
                'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133 Safari/537.36',
                'sec-ch-ua' => self::CLIENT_HINT,
                'sec-ch-ua-mobile' => '?0',
                'sec-ch-ua-platform' => '"Windows"',
                'sec-fetch-dest' => 'empty',
                'sec-fetch-mode' => 'cors',
                'sec-fetch-site' => 'same-origin',
            ]);
    }

    private function dateToTimestamp(string $date, bool $endOfDay): int
    {
        $parsed = CarbonImmutable::createFromFormat('!Y-m-d', $date, 'Asia/Ho_Chi_Minh');
        if (! $parsed || $parsed->format('Y-m-d') !== $date) {
            throw new InvalidArgumentException('Khoảng ngày báo cáo không hợp lệ.');
        }
        $method = $endOfDay ? 'endOfDay' : 'startOfDay';

        return $parsed->{$method}()->timestamp;
    }
}
