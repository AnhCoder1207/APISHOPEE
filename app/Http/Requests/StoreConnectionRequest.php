<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreConnectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => [$this->isMethod('post') ? 'required' : 'sometimes', 'string', 'min:2', 'max:80'],
            'cookie_json' => [$this->isMethod('post') ? 'required' : 'sometimes', 'string', 'min:2', 'max:512000'],
            'is_default' => ['sometimes', 'boolean'],
        ];
    }
}
