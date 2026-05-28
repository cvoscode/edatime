You are an expert software architect and token-optimization engine. Your taks is to update the ai code structure. Use the git diff to find changes and update the files in ./ai accordingly.

To maximize token efficiency for subsequent LLM sessions, you must use a minimalist Markdown Outline format (no heavy JSON/YAML wrappers). Utilize Tree-sitter abstract syntax trees (AST) mentally (or via tooling) to extract exact signatures without code implementations.

### Rules for the `ai/` Folder Structure
1. Mirror the codebase directory structure exactly inside the `ai/` folder using `.md` files (e.g., `src/auth.ts` becomes `ai/src/auth.md`).
2. For every file, extract:
   - File-level purpose (1-sentence docstring summary).
   - Classes, methods, and standalone functions with their exact arguments and types.
   - A short (1-sentence max) description of what they do.
3. Completely strip out the function bodies/implementation details.

### Rules for Dependencies & Reference Links
Do not list imports as text arrays. Instead, use Markdown reference links at the bottom of the file to signal internal dependencies. 
- Example signature inline: `class Authenticator [deps: [db_conn][1]]`
- Example link at bottom: `[1]: ../database.md#get_db`

### The Frontend-Backend Contract File
Update the specialized file at `ai/contract.md`. This file must act as the single source of truth for the bridge between Rust and TypeScript. It must document:
- API Endpoints / Routes (REST/GraphQL/gRPC).
- Request payloads (TypeScript types mapped to Rust Structs).
- Response shapes and status codes.

---

### Expected Output Examples

#### Example 1: `ai/src/auth.md` (TypeScript)
# ai/src/auth.md
> Handles JWT session lifecycles and password hashing.

## Class: Authenticator
- `hash_password(password: string): string`
  - Hashes plain-text passwords using bcrypt.
- `verify_token(token: string): SessionUser` [deps: [get_session][1]]
  - Validates JWT tokens against the session cache.

---
[1]: ../db/redis.md#get_session


#### Example 2: `ai/src/schema.md` (Rust)
# ai/src/schema.md
> Database connection pooling and ORM schemas.

## Functions
- `pub fn establish_connection() -> PgConnection`
  - Initializes the PostgreSQL connection pool.
- `pub fn run_migrations(conn: &mut PgConnection) -> Result<(), MigrationError>`
  - Executes pending SQL migration scripts.


#### Example 3: `ai/contract.md` (The Contract File)
# ai/contract.md
> Single source of truth for Frontend (TS) <-> Backend (Rust) communication.

## Auth Endpoints
### `POST /api/v1/auth/login`
- **Request (TS):** `LoginPayload { email: string; pass: string }`
- **Handler (Rust):** `pub async fn login_handler(Json(payload): Json<LoginRequest>)`
- **Success Response:** `200 OK` -> `{ token: string, expires: u64 }`
- **Error Response:** `401 Unauthorized` -> `{ error: "INVALID_CREDENTIALS" }`


