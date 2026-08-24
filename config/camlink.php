<?php

return [
    'shopee_base_api' => env('SHOPEE_BASE_API', 'https://affiliate.shopee.vn/api/v3'),
    'shopee_timeout' => (int) env('SHOPEE_TIMEOUT', 20),
    'shopee_ca_bundle' => env('SHOPEE_CA_BUNDLE'),
    'web_sync_max_pages' => (int) env('WEB_SYNC_MAX_PAGES', 25),
    'api_rate_limit' => (int) env('API_RATE_LIMIT', 60),
    'starter_monthly_quota' => (int) env('STARTER_MONTHLY_QUOTA', 2000),
    'api_key_prefix' => env('API_KEY_PREFIX', 'clk_live_'),
];
