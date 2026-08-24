<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class DocsController
{
    public function openapi(): JsonResponse
    {
        return response()->json([
            'openapi' => '3.1.0',
            'info' => [
                'title' => 'Camlink Unofficial Shopee Affiliate API',
                'version' => '1.0.0',
                'description' => 'API không chính thức cho Convert Link Affiliate và Conversion Reports.',
            ],
            'servers' => [['url' => rtrim(config('app.url'), '/')]],
            'security' => [['bearerAuth' => []]],
            'components' => [
                'securitySchemes' => ['bearerAuth' => ['type' => 'http', 'scheme' => 'bearer', 'bearerFormat' => 'clk_live_...']],
                'schemas' => [
                    'ConvertLinkRequest' => [
                        'type' => 'object',
                        'required' => ['original_links'],
                        'properties' => [
                            'connection_id' => ['type' => ['integer', 'null'], 'description' => 'Bỏ trống để dùng kết nối mặc định.'],
                            'original_links' => ['type' => 'array', 'minItems' => 1, 'maxItems' => 5, 'items' => ['type' => 'string', 'format' => 'uri']],
                            'sub_id_1' => ['type' => 'string', 'maxLength' => 100],
                            'sub_id_2' => ['type' => 'string', 'maxLength' => 100],
                            'sub_id_3' => ['type' => 'string', 'maxLength' => 100],
                            'sub_id_4' => ['type' => 'string', 'maxLength' => 100],
                            'sub_id_5' => ['type' => 'string', 'maxLength' => 100],
                        ],
                    ],
                    'ConversionReportRequest' => [
                        'type' => 'object',
                        'required' => ['start_date', 'end_date', 'limit', 'page'],
                        'properties' => [
                            'connection_id' => ['type' => ['integer', 'null']],
                            'start_date' => ['type' => 'string', 'format' => 'date'],
                            'end_date' => ['type' => 'string', 'format' => 'date'],
                            'limit' => ['type' => 'integer', 'enum' => [20, 40, 100]],
                            'page' => ['type' => 'integer', 'minimum' => 1],
                            'order_id' => ['type' => ['string', 'null']],
                            'status' => ['type' => ['integer', 'null'], 'enum' => [1, 2, 3, 4, null]],
                        ],
                    ],
                    'ApiError' => [
                        'type' => 'object',
                        'properties' => [
                            'success' => ['type' => 'boolean', 'example' => false],
                            'error' => ['type' => 'object', 'properties' => [
                                'code' => ['type' => 'string', 'example' => 'SHOPEE_SESSION_EXPIRED'],
                                'message' => ['type' => 'string'],
                                'request_id' => ['type' => 'string', 'format' => 'uuid'],
                            ]],
                        ],
                    ],
                ],
            ],
            'paths' => [
                '/api/v1/affiliate/convert-link' => ['post' => [
                    'summary' => 'Convert tối đa 5 link Shopee',
                    'security' => [['bearerAuth' => []]],
                    'requestBody' => ['required' => true, 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/ConvertLinkRequest']]]],
                    'responses' => $this->responses('Danh sách shortLink và longLink từ Shopee.'),
                ]],
                '/api/v1/affiliate/conversion-reports' => ['post' => [
                    'summary' => 'Lấy báo cáo chuyển đổi',
                    'security' => [['bearerAuth' => []]],
                    'requestBody' => ['required' => true, 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/ConversionReportRequest']]]],
                    'responses' => $this->responses('Danh sách conversion report và metadata đồng bộ.'),
                ]],
                '/api/health' => ['get' => ['summary' => 'Health check', 'security' => []]],
            ],
        ]);
    }

    public function docs(): Response
    {
        return response()->view('docs');
    }

    private function responses(string $successDescription): array
    {
        $error = ['content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/ApiError']]]];

        return [
            '200' => ['description' => $successDescription],
            '401' => ['description' => 'API key không hợp lệ.'] + $error,
            '422' => ['description' => 'Validation hoặc phiên Shopee hết hạn.'] + $error,
            '429' => ['description' => 'Rate limit hoặc quota đã hết.'] + $error,
            '502' => ['description' => 'Shopee upstream lỗi hoặc trả dữ liệu không hợp lệ.'] + $error,
        ];
    }
}
