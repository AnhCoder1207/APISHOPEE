<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ConversionReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'connection_id' => $this->input('connection_id', $this->input('connectionId')),
            'start_date' => $this->input('start_date', $this->input('startDate')),
            'end_date' => $this->input('end_date', $this->input('endDate')),
            'order_id' => $this->input('order_id', $this->input('orderId')),
            'limit' => (int) $this->input('limit', 20),
            'page' => (int) $this->input('page', 1),
            'status' => $this->filled('status') ? (int) $this->input('status') : null,
        ]);
    }

    public function rules(): array
    {
        return [
            'connection_id' => ['nullable', 'integer', 'min:1'],
            'start_date' => ['required', 'date_format:Y-m-d'],
            'end_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'limit' => ['required', Rule::in([20, 40, 100])],
            'page' => ['required', 'integer', 'min:1'],
            'order_id' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in([1, 2, 3, 4])],
        ];
    }
}
