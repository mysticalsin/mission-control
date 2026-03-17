/**
 * Shared API response envelope helpers.
 *
 * Provides a consistent JSON shape for every API route so clients can rely on
 * a single discriminated union (`success: true | false`) instead of guessing
 * per-endpoint structure.  Designed to eventually replace the Jarvis-specific
 * `envelope()` / `envelopeError()` in jarvis-proxy.ts and the ad-hoc
 * `NextResponse.json({ error })` calls scattered across ~60 route files.
 */

import { NextResponse } from 'next/server'

// ── Types ────────────────────────────────────────────────────────────────────

/** Successful response body — data is always present, error is always null. */
export interface ApiSuccessBody<T = unknown> {
  readonly success: true
  readonly data: T
  readonly error: null
}

/** Error response body — data is always null, error describes the failure. */
export interface ApiErrorBody {
  readonly success: false
  readonly data: null
  readonly error: string
}

/** Pagination metadata attached alongside `data` in paginated responses. */
export interface PaginationMeta {
  readonly total: number
  readonly page: number
  readonly limit: number
  readonly totalPages: number
}

/** Paginated response body — extends success with pagination metadata. */
export interface ApiPaginatedBody<T = unknown> {
  readonly success: true
  readonly data: T
  readonly error: null
  readonly pagination: PaginationMeta
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a success envelope.
 *
 * @param data   - The payload to include under `data`.
 * @param status - HTTP status code (default 200).
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json(
    { success: true as const, data, error: null },
    { status },
  )
}

/**
 * Return an error envelope.
 *
 * @param message - Human-readable error description (never leak internals).
 * @param status  - HTTP status code (default 500).
 */
export function apiError(message: string, status: number = 500): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { success: false as const, data: null, error: message },
    { status },
  )
}

/**
 * Return a paginated success envelope.
 *
 * Keeps the standard `success / data / error` shape and adds a `pagination`
 * block so clients can render pagers without calculating totalPages themselves.
 *
 * @param data  - Array (or any shape) representing the current page of results.
 * @param total - Total number of records matching the query.
 * @param page  - Current 1-based page number.
 * @param limit - Maximum items per page.
 */
export function apiPaginated<T>(
  data: T,
  total: number,
  page: number,
  limit: number,
): NextResponse<ApiPaginatedBody<T>> {
  const safePage = Math.max(1, page)
  const safeLimit = Math.max(1, limit)

  return NextResponse.json(
    {
      success: true as const,
      data,
      error: null,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    },
    { status: 200 },
  )
}
