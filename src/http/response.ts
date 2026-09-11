import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { NotFoundError, ValidationError } from './errors'

/**
 * API Gateway always sends `requestContext`, but a direct invoke does not — and
 * the error path must never be the thing that throws.
 */
export const requestIdOf = (event: APIGatewayProxyEvent): string =>
  event.requestContext?.requestId ?? 'unknown'

export const jsonResponse = (statusCode: number, body: object): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

/** `Error` fields are non-enumerable, so spell them out to survive JSON logging. */
const describeError = (error: unknown): Record<string, unknown> =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: typeof error, message: String(error) }

/** Unknown failures become a generic 500 so internals never reach the caller. */
export const errorResponse = (error: unknown, requestId: string): APIGatewayProxyResult => {
  if (error instanceof ValidationError) return jsonResponse(400, { message: error.message })
  if (error instanceof NotFoundError) return jsonResponse(404, { message: error.message })

  // Nested, not spread: a top-level `message` would collide with the field the
  // JSON log format uses for the log line itself.
  console.error('Unhandled error', { requestId, error: describeError(error) })
  return jsonResponse(500, { message: 'Internal server error.', requestId })
}
