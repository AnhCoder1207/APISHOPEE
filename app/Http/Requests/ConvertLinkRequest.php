<?php

namespace App\Http\Requests;

use App\Services\Shopee\ShopeeAffiliateClient;
use Illuminate\Foundation\Http\FormRequest;

class ConvertLinkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'connection_id' => $this->input('connection_id', $this->input('connectionId')),
            'original_links' => $this->input('original_links', $this->input('originalLinks', $this->input('originalLink'))),
            ...collect(range(1, 5))->mapWithKeys(fn (int $i) => [
                "sub_id_{$i}" => $this->input("sub_id_{$i}", $this->input("subId{$i}", '')),
            ])->all(),
        ]);
    }

    public function rules(): array
    {
        return [
            'connection_id' => ['nullable', 'integer', 'min:1'],
            'original_links' => ['required', 'array', 'min:1', 'max:5'],
            'original_links.*' => ['required', 'string', 'url', 'max:2048'],
            'sub_id_1' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
            'sub_id_2' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
            'sub_id_3' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
            'sub_id_4' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
            'sub_id_5' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]*$/'],
        ];
    }

    public function after(): array
    {
        return [function ($validator) {
            if ($validator->errors()->isEmpty()) {
                try {
                    app(ShopeeAffiliateClient::class)->validateLinks($this->input('original_links', []));
                } catch (\InvalidArgumentException $exception) {
                    $validator->errors()->add('original_links', $exception->getMessage());
                }
            }
        }];
    }
}
