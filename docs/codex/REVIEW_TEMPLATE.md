# Codex review template

Review the requested change against the task, the root `AGENTS.md`, and only
the routed documents relevant to the changed area. Prioritize concrete,
actionable findings over summaries or style preferences.

## Requirement correctness

- Does the change satisfy each acceptance criterion?
- Does behavior match the authoritative product and domain documentation?
- Are unsupported assumptions or invented facts presented as confirmed?

## Scope control

- Are there unrelated changes or unnecessary refactors?
- Did the implementation expand product scope or add policy decisions without
  approval?

## Architecture and boundaries

- Does the change preserve documented application and dependency boundaries?
- Are new source-of-truth locations or integrations documented accurately?
- Are plans or assumptions mistakenly represented as current behavior?

## Regression and validation

- What existing behavior can the change affect?
- Do tests cover the changed behavior, boundaries, and meaningful failures?
- Were relevant checks run, and are any failures or omissions explained?
- Were tests, validation, types, or safeguards weakened to obtain a pass?

## Security and privacy

- Are tenant isolation and authorization enforced for every affected path?
- Is sensitive data minimized and kept out of logs, fixtures, client output,
  and model prompts where it is not required?
- Are evidence provenance, integrity, access, and audit requirements preserved?
- Are secrets handled through approved configuration rather than committed?
- Is human approval preserved before external submission?

## Documentation drift

- Did externally visible behavior, architecture, API, schema, security posture,
  or durable project knowledge change?
- If so, are the narrow authoritative documents updated without duplicating
  rules?
- Do all referenced paths and links exist?

## Review output

Report findings first, ordered by severity. For each finding, identify the
location, impact, and the smallest credible correction. Then list unresolved
questions and validation gaps. If there are no findings, say so and note any
residual risk or unverified area.
