import type { APIGatewayProxyEvent } from 'aws-lambda'
import { NotFoundError, ValidationError } from '../../src/http/errors'
import { errorResponse, jsonResponse, requestIdOf } from '../../src/http/response'

describe('requestIdOf', () => {
  it('reads the id from an API Gateway event', () => {
    const event = { requestContext: { requestId: 'req-1' } } as APIGatewayProxyEvent

    expect(requestIdOf(event)).toBe('req-1')
  })

  it('falls back rather than throwing when there is no requestContext', () => {
    expect(requestIdOf({} as APIGatewayProxyEvent)).toBe('unknown')
  })
})

describe('jsonResponse', () => {
  it('serialises the body and declares JSON', () => {
    expect(jsonResponse(201, { gameId: 'abc' })).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"gameId":"abc"}',
    })
  })
})

describe('errorResponse', () => {
  it('maps a validation error to 400 and passes the reason through', () => {
    const response = errorResponse(new ValidationError('"guess" must be a number.'), 'req-1')

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ message: '"guess" must be a number.' })
  })

  it('maps a not-found error to 404 and passes the reason through', () => {
    const response = errorResponse(new NotFoundError('Game not found.'), 'req-1')

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ message: 'Game not found.' })
  })

  it('maps an unexpected error to 500 without leaking its details', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = errorResponse(new Error('ProvisionedThroughputExceededException'), 'req-1')

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      message: 'Internal server error.',
      requestId: 'req-1',
    })
    expect(response.body).not.toContain('ProvisionedThroughputExceededException')
  })

  it('logs the cause as structured fields so it stays queryable', () => {
    const error = new Error('boom')
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    errorResponse(error, 'req-1')

    expect(log).toHaveBeenCalledWith('Unhandled error', {
      requestId: 'req-1',
      error: { name: 'Error', message: 'boom', stack: error.stack },
    })
  })

  it('handles a thrown value that is not an Error', () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = errorResponse('not an error', 'req-1')

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      message: 'Internal server error.',
      requestId: 'req-1',
    })
    expect(log).toHaveBeenCalledWith('Unhandled error', {
      requestId: 'req-1',
      error: { name: 'string', message: 'not an error' },
    })
  })
})
