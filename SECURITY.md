# Security Policy

## Supported version

The repository currently supports the latest `main` branch state only.

## Reporting a vulnerability

Do not open a public issue for an undisclosed security vulnerability.

Report security findings privately to the maintainers with:

- a clear description of the issue
- affected routes, files, or workflows
- reproduction steps or proof of concept
- impact assessment
- any suggested remediation

If a private reporting channel does not exist yet for your deployment, establish one before publishing the service beyond local or trusted internal use.

## Current safeguards

The application currently includes:

- request validation for time windows, bucket counts, viewport widths, scatter limits, and selected columns
- per-client rate limiting with retry headers
- upload request-size enforcement
- temporary-file based upload handling instead of persistent temp-path reuse
- structured error responses with correlation IDs
- Content Security Policy headers on the frontend shell

## Automated auditing

Dependency auditing is automated through `.github/workflows/security.yml`, which runs `cargo audit` on dependency changes and on a weekly schedule.

Run the same audit locally with:

```bash
cargo install cargo-audit --locked
cargo audit
```

## Operational notes

This repository still uses permissive CORS and does not implement authentication. Treat it as an internal or development-facing service unless you add stricter deployment controls.