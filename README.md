# Guess the Number

[![CI](https://github.com/saamo/guessthenumber/actions/workflows/ci.yml/badge.svg)](https://github.com/saamo/guessthenumber/actions/workflows/ci.yml)

A serverless "Guess the Number" game: start a game, then guess a number between 1 and 100 until
you get it right. Built on **API Gateway + Lambda + DynamoDB**, deployed with **AWS CDK** in
**TypeScript**.

```
            POST /start-game   ┌──────────────────┐   PutItem    ┌────────────────┐
 client ──▶ API Gateway ──────▶│ start-game λ     │─────────────▶│                │
            (REST, stage       └──────────────────┘              │  DynamoDB      │
             "prod")           ┌──────────────────┐   GetItem    │  games table   │
            POST /guess ──────▶│ guess λ          │─────────────▶│  PK: gameId    │
                               └──────────────────┘              └────────────────┘
```

Two single-purpose functions rather than one router, so each can be granted exactly one DynamoDB
action.

## API

Base URL is the `ApiUrl` stack output, e.g. `https://{id}.execute-api.{region}.amazonaws.com/prod`.

### `POST /start-game`

No request body. Creates a game with a secret number in `[1, 100]`.

`201 Created`

```json
{
  "gameId": "3f9c1f7a-8d3e-4a1c-9b2e-6d5a0f4c8e11",
  "message": "Game started. Make a guess between 1 and 100."
}
```

### `POST /guess`

```json
{ "gameId": "3f9c1f7a-8d3e-4a1c-9b2e-6d5a0f4c8e11", "guess": 42 }
```

`200 OK` — one of:

```json
{ "message": "Too low. Try again!" }
{ "message": "Too high. Try again!" }
{ "message": "Correct! You've guessed the number." }
```

### Errors

Every response carries a `message`, so clients parse one shape.

| Status | When                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| `400`  | Missing body, malformed JSON, non-object payload, bad `gameId`, or a `guess` that is not an integer in 1–100 |
| `404`  | `gameId` does not exist                                                                                      |
| `500`  | Anything unexpected. The cause is logged; the caller gets an opaque message and a `requestId` to quote       |

A numeric _string_ (`"guess": "42"`) is rejected rather than coerced. The API is server-to-server:
no CORS headers, so a browser client would need `defaultCorsPreflightOptions` on the `RestApi`.

## Getting started

```bash
nvm use            # Node 24, per .nvmrc
npm install
npm run format:check
npm run lint
npm run typecheck
npm test           # jest with coverage; the 100% threshold is enforced
npm run synth      # cdk synth — needs no AWS credentials
```

CI runs the first four on every push and pull request.

## Deploy

```bash
export AWS_PROFILE=<profile>
export AWS_REGION=<region>

npx cdk bootstrap          # first time in this account/region only
npm run deploy             # prints the ApiUrl output
```

Smoke test it:

```bash
API=$(aws cloudformation describe-stacks --stack-name GuessTheNumberStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)

ID=$(curl -sS -X POST "${API}start-game" | python3 -c 'import json,sys; print(json.load(sys.stdin)["gameId"])')

curl -sS -X POST "${API}guess" -H 'content-type: application/json' -d "{\"gameId\":\"$ID\",\"guess\":50}"
curl -sS -X POST "${API}guess" -H 'content-type: application/json' -d "{\"gameId\":\"nope\",\"guess\":50}"   # 404
curl -sS -X POST "${API}guess" -H 'content-type: application/json' -d "{\"gameId\":\"$ID\",\"guess\":101}"  # 400
```

Tear down with `npm run destroy`.

## Layout

```
bin/app.ts                         CDK app entry
infra/game-stack.ts                composition root: wires the constructs together
infra/constructs/games-table.ts    the table, plus grants named as domain operations
infra/constructs/game-function.ts  the Lambda conventions, in one place
infra/constructs/game-api.ts       the REST API and its routes
src/domain/game.ts                 game rules — pure, no I/O
src/http/                          request parsing, errors, responses
src/repository/games.ts            DynamoDB reads and writes
src/handlers/                      one Lambda entry point per endpoint
test/                              mirrors src/ and infra/
```

The game rules live in a pure module with no AWS types, so they are tested directly. Handlers only
wire together parsing, storage and responses.

## Design decisions

- **`201` for `POST /start-game`.** It creates a resource. `POST /guess` evaluates an existing one
  and answers `200`.
- **Least-privilege IAM, named as domain operations.** `GamesTable` exposes `grantCreateGame` /
  `grantReadGame`, each resolving to a single action rather than `grantWriteData` / `grantReadData`.
  The stack asks for a capability; the table decides what it costs in IAM.
- **One construct per component.** The stack is pure composition, so `GameFunction` can be
  synthesised and tested on its own — its conventions hold for any function built through it, not
  just today's two.
- **`crypto.randomInt`, not `Math.random()`.** A CSPRNG, so a client cannot predict the secret from
  earlier games.
- **Consistent reads on `GetItem`.** A guess can arrive milliseconds after the game is created; an
  eventually consistent read could miss it and return a spurious `404`.
- **Unconditional `PutItem`.** Deliberately no `attribute_not_exists(gameId)`: on a fresh UUID the
  only realistic way that guard fires is an SDK retry of a write that already landed, which would
  `500` a game that exists. The retry resends an identical command, so the unguarded put is
  idempotent anyway.
- **Both boundaries are parsed, not just the HTTP one.** `parseGuessRequest` types the request
  body; `parseGame` types the DynamoDB item, because `GetCommand` hands back `any`. A record with a
  missing or non-numeric `secret` fails loudly instead of reaching the rules as `undefined`.
- **`CORRECT` is never the fallthrough branch.** A secret that cannot be ordered against the guess
  is unordered against _every_ comparison, so falling through to `CORRECT` would turn a corrupt
  record into a free win. The win is matched explicitly and the remainder throws.
- **The secret never leaves the backend.** No response body contains it, and the handler tests
  assert the response shape exactly, so an interpolated secret would fail them.
- **A 500 carries the API Gateway `requestId`.** It is the one status where the caller has nothing
  actionable, so they get an id to quote and the same id is logged beside the cause. `400` and
  `404` stay bare — they already say what went wrong.
- **API Gateway logging left off.** Enabling it creates `AWS::ApiGateway::Account`, an
  account-wide singleton that sets the CloudWatch role for every REST API in the region and
  defaults to `RETAIN`. A throwaway stack has no business claiming it, so correlation is done in
  the handler instead. That is a per-account decision, not a per-stack one.
- **`arm64`, with the AWS SDK left external.** Graviton is ~20% cheaper per GB-second, and safe
  here because nothing native is compiled — the managed runtime supplies the SDK, so each function
  bundles to ~3 kB of architecture-neutral JavaScript. A native dependency or a Lambda layer would
  need arm64 prebuilds and Docker bundling.
- **Source maps built _and_ switched on.** `minify: true` makes raw stack traces useless, so a map
  is bundled — but Node ignores it unless asked, and CDK does not wire that up. Without
  `NODE_OPTIONS=--enable-source-maps` the maps ship as dead weight and traces stay minified.
- **Sizing and lifecycle.** 256 MB because Lambda scales CPU with memory and the 128 MB default
  slows a cold start for a saving that is noise here; a 5 s timeout because one DynamoDB call fits
  comfortably and anything slower is a fault, not slow work; on-demand billing because traffic is
  spiky and costs nothing at idle; one week of log retention because the CloudWatch default is
  _never expire_; `RemovalPolicy.DESTROY` because this stack is meant to be thrown away.
- **A single hardcoded `prod` stage.** `stageName`, `restApiName` and the stack id are fixed
  strings, so this deploys one environment per account. Real dev → staging → prod would
  parameterise all three; the current shape cannot express it.

## Production usage

What this deliberately does not do, and what it would need to run in production.

**Security**

- **Authentication and authorisation.** The API is public and unauthenticated. Add a Cognito user
  pool or JWT/Lambda authorizer; for machine clients, an API key plus a usage plan.
- **AWS WAF** in front of the stage for IP reputation, bot control and rate-based rules.
- **Throttling and quotas.** Per-method throttles and per-key quotas so one caller cannot exhaust
  concurrency; reserved concurrency on the functions to bound blast radius.
- **Request validation at the edge.** API Gateway request models reject malformed payloads before
  they reach Lambda, cutting cost and log noise. The handler validation stays as defence in depth.
- **Anti-cheat.** Today anyone can brute-force 100 guesses in a second. Production would cap
  attempts per game, rate-limit per `gameId`, and expire games.
- **Encryption.** DynamoDB encrypts at rest with an AWS-owned key; a customer-managed KMS key gives
  auditable, revocable control.
- **Least privilege beyond IAM.** No wildcards in policies, `PermissionsBoundary` on deploy roles,
  and CI deploying via a short-lived OIDC role rather than long-lived access keys.

**Availability and resilience**

- **Point-in-time recovery** and AWS Backup on the table; `RemovalPolicy.RETAIN` so a stack delete
  cannot destroy data.
- **Multi-region.** DynamoDB global tables plus a regional API and Route 53 health-checked failover
  for regional outages.
- **Cold starts.** The minified ~3 kB bundle already keeps init time low; beyond that the lever is
  provisioned concurrency. (The `arm64` choice above is a cost lever, not a latency one — it is
  mentioned here only because the two are often conflated.)
- **Idempotency.** Both handlers are safe to retry today (`GetItem` is a read; each `start-game` is
  meant to create a new game). Any endpoint that mutates existing state would need an idempotency
  key with a conditional write.

**Observability**

- Structured JSON logs are enabled and a 500 is traceable end to end via the API Gateway
  `requestId`. Production would add **API Gateway access logs** (see the account-wide caveat
  above — do it once per account, not per stack), **X-Ray** tracing, **EMF** custom metrics
  (games started, guesses, win rate), and **CloudWatch alarms** on 5xx rate, 4xx spikes, p99
  latency, Lambda errors/throttles and DynamoDB throttled requests, wired to an on-call channel.
- Log retention is one week here; production would set a retention aligned to the org's policy and
  ship logs to a central account.

**Delivery and operations**

- **CI/CD.** Format, lint, typecheck and test already run on every push and pull request;
  production would add `cdk diff` on every PR and deploy through dev → staging → prod with manual
  approval, via a GitHub Actions OIDC role.
- **Reproducible builds.** Bundle the AWS SDK instead of relying on the runtime's version, so a
  runtime update cannot change behaviour.
- **Cost.** See the billing-mode decision above. A DynamoDB **TTL** on game items would keep
  storage flat; without one, finished games accumulate forever.
- **Tagging** for cost allocation and ownership, and a `cdk-nag` pass in CI to catch
  security-baseline drift.
