# API & custom clients

The backend is described by an [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3)
contract. The same contract drives the official client and any client you
choose to build.

- **Source**: [`docs/api/openapi.yaml`](https://github.com/mbianchidev/fire-tools/blob/main/docs/api/openapi.yaml)
- **Live viewer**: <https://mbianchidev.github.io/fire-tools/api/>
- **Raw spec**: <https://mbianchidev.github.io/fire-tools/api/openapi.yaml>

## Lint the spec

Before you publish a change to the contract, run the linter:

```sh
npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/redocly.yaml
```

CI runs the same command on every PR.

## Try it with curl

The API is mounted at `/api/v1/`. Some examples:

```sh
# liveness
curl -s http://localhost:3000/api/v1/health

# list users (default deploy seeds a single user)
curl -s http://localhost:3000/api/v1/users

# create a user setting
curl -s -X POST http://localhost:3000/api/v1/users/USER_ID/settings \
  -H 'content-type: application/json' \
  -d '{"key":"language","value":"en"}'
```

The full set of routes (and request/response shapes) lives in the OpenAPI
viewer.

## Generate a typed client

Any language is fair game; the OpenAPI ecosystem has good generators for
TypeScript, Python, Go, Rust, Swift, Kotlin and more. The TypeScript flow:

```sh
npx openapi-typescript docs/api/openapi.yaml -o src/api/schema.ts
```

That gives you a `paths` and `components` type map you can hand to a small
fetch wrapper. The official frontend uses the same approach.

## Build a custom frontend

You don't need our React app at all. As long as your client speaks the
OpenAPI contract, the backend doesn't care. A minimal recipe:

1. **Spin up the backend**: see [backend deployment](./backend-deploy.md).
2. **Generate a typed client** for your language.
3. **Implement a UI** on top of it (React, Vue, SwiftUI, native — whatever).
4. **Point your client at `http://your-host:3000/api/v1/`** (or a TLS proxy).
5. **Set `CORS_ORIGIN`** in the backend to your client's origin so the
   browser will let it call the API cross-origin.

If you build something open-source, send a PR to add it to the README.

## Auth model

The bootstrap deploy runs single-user; the user is implicit and every
domain row carries the `user_id`. If you want multi-tenant, you provide
authentication in front of the API (e.g. an auth proxy with OIDC) and pass
the resolved user identifier through a header your client uses to scope
requests. The schema is already ready for multiple users — there is no
schema change to make.

## Versioning

The contract uses SemVer-flavoured `info.version`. Breaking changes bump the
major; additive changes bump the minor. The path itself (`/api/v1/`) only
bumps on a major change. Clients pin a major.
