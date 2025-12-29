/**
 * Fluent API builder for OpenCode routes
 * ADR 002 Layer 2 - Depends on types.ts only
 */
import type { Schema } from "effect"
import type {
	RouteConfig,
	Route,
	RouteBuilder,
	HandlerFn,
	MiddlewareFn,
	ErrorHandlerFn,
	Duration,
	RetryConfig,
} from "./types.js"

/**
 * Internal builder state
 * Accumulates configuration as methods are chained
 */
class OpencodeRouteBuilder<TInput = unknown, TOutput = unknown>
	implements RouteBuilder<TInput, TOutput>
{
	private config: RouteConfig
	private inputSchema?: Schema.Schema<TInput, unknown>
	private middlewareChain: MiddlewareFn<unknown, unknown>[] = []
	private handlerFn?: HandlerFn<TInput, TOutput, unknown>
	private errorHandlerFn?: ErrorHandlerFn<TInput, TOutput, unknown>

	constructor(initialConfig: RouteConfig = {}) {
		this.config = { ...initialConfig }
	}

	input<T>(schema: Schema.Schema.All & { Type: T }): RouteBuilder<T, TOutput> {
		const builder = this as unknown as OpencodeRouteBuilder<T, TOutput>
		builder.inputSchema = schema as unknown as Schema.Schema<T, unknown>
		return builder
	}

	timeout(duration: Duration): RouteBuilder<TInput, TOutput> {
		this.config.timeout = duration
		return this
	}

	retry(retryConfig: RetryConfig): RouteBuilder<TInput, TOutput> {
		this.config.retry = retryConfig
		return this
	}

	concurrency(limit: number): RouteBuilder<TInput, TOutput> {
		this.config.concurrency = limit
		return this
	}

	stream(): RouteBuilder<TInput, TOutput> {
		this.config.stream = true
		return this
	}

	heartbeat(interval: Duration): RouteBuilder<TInput, TOutput> {
		this.config.heartbeat = interval
		return this
	}

	cache(cacheConfig: {
		ttl: Duration
		key?: (input: TInput) => string
	}): RouteBuilder<TInput, TOutput> {
		this.config.cache = cacheConfig as RouteConfig["cache"]
		return this
	}

	middleware<TCtx>(fn: MiddlewareFn<TInput, TCtx>): RouteBuilder<TInput, TOutput> {
		this.middlewareChain.push(fn as MiddlewareFn<unknown, unknown>)
		return this
	}

	onError(fn: ErrorHandlerFn<TInput, TOutput, unknown>): RouteBuilder<TInput, TOutput> {
		this.errorHandlerFn = fn
		return this
	}

	handler<T>(fn: HandlerFn<TInput, T, unknown>): Route<TInput, T> {
		// Terminal method: return compiled Route object
		// Type assertion needed because we transform TOutput -> T on this call
		return {
			_config: this.config,
			_inputSchema: this.inputSchema,
			_middleware: this.middlewareChain,
			_handler: fn,
			_errorHandler: this.errorHandlerFn,
		} as Route<TInput, T>
	}
}

/**
 * Factory function for creating route builders
 * ADR 002: o(config).input(...).handler(...)
 *
 * @example
 * ```typescript
 * const o = createOpencodeRoute()
 *
 * const route = o({ timeout: "30s" })
 *   .input(Schema.Struct({ id: Schema.String }))
 *   .handler(async ({ input, sdk }) => sdk.session.get(input.id))
 * ```
 */
export function createOpencodeRoute() {
	return (config: RouteConfig = {}): RouteBuilder => {
		return new OpencodeRouteBuilder(config)
	}
}
