/**
 * Core types for Effect-based router
 * ADR 002 Layer 1 - No dependencies on other router files
 */
import { Context } from "effect"
import type { Schema } from "effect"
import type { OpencodeClient } from "../client.js"

/**
 * Duration string with unit suffix
 * Examples: "5s", "100ms", "2m", "1h"
 */
export type Duration = `${number}${"ms" | "s" | "m" | "h"}`

/**
 * Retry configuration
 * - String presets: "none" | "exponential" | "linear"
 * - Custom object with maxAttempts, delay, backoff
 */
export type RetryConfig =
	| "none"
	| "exponential"
	| "linear"
	| {
			maxAttempts: number
			delay: Duration
			backoff?: number
	  }

/**
 * Route-level configuration
 * All fields are optional
 */
export interface RouteConfig {
	/** Request timeout */
	timeout?: Duration
	/** Retry strategy */
	retry?: RetryConfig
	/** Max concurrent requests */
	concurrency?: number
	/** Enable streaming response */
	stream?: boolean
	/** Heartbeat interval for long-running requests */
	heartbeat?: Duration
	/** Cache configuration */
	cache?: {
		ttl: Duration
		key?: (input: unknown) => string
	}
}

/**
 * Handler execution context
 * Available to all route handlers
 */
export interface HandlerContext<TInput = unknown, TCtx = unknown> {
	/** Parsed and validated input */
	input: TInput
	/** OpenCode SDK client */
	sdk: OpencodeClient
	/** AbortSignal for cancellation */
	signal: AbortSignal
	/** Additional context (from middleware) */
	ctx: TCtx
}

/**
 * Handler function signature
 * Returns Promise<TOutput> for regular routes
 * Returns AsyncGenerator<TOutput> for streaming routes
 */
export type HandlerFn<TInput = unknown, TOutput = unknown, TCtx = unknown> = (
	context: HandlerContext<TInput, TCtx>,
) => Promise<TOutput> | AsyncGenerator<TOutput, void, unknown>

/**
 * Middleware function signature
 * Can transform context and chain to next middleware
 */
export type MiddlewareFn<TInput = unknown, TCtx = unknown> = (
	context: HandlerContext<TInput, TCtx>,
	next: () => Promise<unknown>,
) => Promise<unknown>

/**
 * Error handler function signature
 */
export type ErrorHandlerFn<TInput = unknown, TOutput = unknown, TCtx = unknown> = (
	error: unknown,
	context: HandlerContext<TInput, TCtx>,
) => Promise<TOutput> | TOutput

/**
 * Compiled route with all configuration
 * Internal representation - users don't construct this directly
 */
export interface Route<TInput = unknown, TOutput = unknown> {
	/** Route configuration */
	_config: RouteConfig
	/** Input validation schema */
	_inputSchema?: Schema.Schema<TInput, unknown>
	/** Middleware chain */
	_middleware: MiddlewareFn<TInput, unknown>[]
	/** Main handler function */
	_handler?: HandlerFn<TInput, TOutput, unknown>
	/** Error handler */
	_errorHandler?: ErrorHandlerFn<TInput, TOutput, unknown>
}

/**
 * Fluent API for building routes
 * Users chain methods to configure the route
 */
export interface RouteBuilder<TInput = unknown, TOutput = unknown> {
	/** Set input schema for validation */
	input<T>(schema: Schema.Schema.All & { Type: T }): RouteBuilder<T, TOutput>

	/** Set request timeout */
	timeout(duration: Duration): RouteBuilder<TInput, TOutput>

	/** Configure retry strategy */
	retry(config: RetryConfig): RouteBuilder<TInput, TOutput>

	/** Set max concurrent requests */
	concurrency(limit: number): RouteBuilder<TInput, TOutput>

	/** Enable streaming response */
	stream(): RouteBuilder<TInput, TOutput>

	/** Set heartbeat interval */
	heartbeat(interval: Duration): RouteBuilder<TInput, TOutput>

	/** Configure response caching */
	cache(config: { ttl: Duration; key?: (input: TInput) => string }): RouteBuilder<TInput, TOutput>

	/** Add middleware to the chain */
	middleware<TCtx>(fn: MiddlewareFn<TInput, TCtx>): RouteBuilder<TInput, TOutput>

	/** Set the main handler function and return compiled Route (terminal method) */
	handler<T>(fn: HandlerFn<TInput, T, unknown>): Route<TInput, T>

	/** Set error handler */
	onError(fn: ErrorHandlerFn<TInput, TOutput, unknown>): RouteBuilder<TInput, TOutput>
}

/**
 * Router environment Context tag
 * Provides router instance via Effect Context
 */
export interface RouterEnv {
	readonly directory: string
	readonly baseUrl: string
}

/**
 * Effect Context tag for RouterEnv
 */
export const RouterEnv = Context.GenericTag<RouterEnv>("@opencode/RouterEnv")
