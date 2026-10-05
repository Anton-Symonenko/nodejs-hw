# nodejs-hw

Express notes API with cookie-based sessions, user avatars and email password resets.

## API documentation

Install dependencies with `npm install`, configure the application's environment variables, and start it with `npm start` (or `npm run dev`). MongoDB must be available for server startup.

Open [Swagger UI](http://localhost:3000/api-docs) to browse all 12 API operations. The server defaults to port 3000; if `PORT` is overridden, use that port. Swagger UI also uses the configured port for requests.

The complete OpenAPI 3.0.0 specification is in [swagger.json](./swagger.json). Regenerate it after changing validation or API behavior:

```sh
npm run docs:generate
```

[scripts/generate-openapi.js](./scripts/generate-openapi.js) imports the Celebrate/Joi schemas and converts their descriptions directly. Controller responses, model serialization, route security and upload behavior are documented explicitly in the generator. Update those definitions when controllers, models or middleware change. No JSDoc annotations are used.

### Authentication in Swagger UI

Use `/auth/register` or `/auth/login` to establish a session, then try the protected operations in the same browser. Notes and avatar operations require **both** `sessionId` and `accessToken`; `/auth/refresh` requires **both** `sessionId` and `refreshToken`. Logout accepts an optional session cookie and returns an empty 204 response.

Session cookies are `HttpOnly`, `Secure` and `SameSite=None`. Swagger UI enables credentialed requests; the browser manages cookies. Its Authorize dialog cannot directly set HttpOnly cookies. Browser cookie policies still apply, including whether secure cookies are accepted on localhost. Use HTTPS when required by your browser or deployment.

### Behavior represented in the spec

- Celebrate failures return status 400 with `statusCode`, `error`, `message` and per-segment `validation` details. Controller and unexpected errors return `{ "message": "..." }`.
- User responses omit the password and include Mongoose timestamps and `__v`. Note responses include the owner's `userId`, timestamps and `__v`.
- Avatar uploads use multipart field `avatar`, accept one `image/*` file up to 2 MiB and return `{ "url": "..." }`. Missing files return 400; Multer errors currently return 500 through the generic error handler.
- The notes router's unscoped authentication middleware also runs for subsequent routes, including the avatar route and unknown paths. Unknown requests may therefore return 401 before reaching the 404 handler. Swagger UI is mounted before that router so it is publicly accessible.
