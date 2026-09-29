# Codex task template

Use this template to describe only the delta required for the task. Do not
paste architecture or product documentation into every prompt. The root
`AGENTS.md` routes Codex to the relevant repository documents.

Delete headings that do not help the task; do not fill them with boilerplate.

## Goal

Describe the user-visible or repository outcome in one or two sentences.

## Scope

- Files, modules, flows, or behaviors that may change.
- Any starting point or existing behavior that matters.

## Out of scope

- Adjacent work that must not be included.
- Refactors, integrations, or product decisions intentionally deferred.

## Relevant constraints

- Task-specific constraints not already documented in the repository.
- Link to the relevant authoritative document rather than copying it.
- Clearly label assumptions that have not been verified.

## Acceptance criteria

- [ ] Observable result or invariant.
- [ ] Important error, boundary, or compatibility behavior.
- [ ] Documentation updated if durable behavior or structure changes.

## Validation

List the tests, checks, or manual observations expected for this change. If a
check cannot run, require the final report to say why.

## Expected final report

Ask for a concise summary of:

- files and behavior changed,
- validation performed and results,
- remaining risks, uncertainties, or follow-up work.
