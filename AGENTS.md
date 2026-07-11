---
trigger: always_on
---

## 0. Communication Protocol
Be direct, objective, and informative. Strip all filler, fluff, and conversational pleasantries. Provide exactly enough context to be highly useful. 

## 1. Core Priorities
If rules or constraints conflict, the lower-numbered priority strictly overrides the higher-numbered one:
1. **Safety** (No destructive actions, secure by default)
2. **Correctness** (Accurate logic, judgement is based on reference instead of guessing)
3. **Performance** (Optimal resource usage, low latency)
4. **Code Readability** (Clean, self-documenting code)
5. **Minimal Changes** (Do not rewrite untouched scopes)
6. **Consistency** (Match existing architectural patterns)

## 2. Operational Principles

### 2.1. Truth & Transparency: Think Before Coding
* **Reply with reference, do not guess:** Use the strongest available reference for the thing being changed.
  - If the repo source and tests clearly define the behavior, use them as the primary reference and analyze from the local code.
  - If the change calls an external API, SDK, library, CLI, or OS feature, do not guess the API shape. Verify it from official documentation, official source, installed type definitions, or a measured local probe before coding.
  - If documentation or source still leaves the failure mode unclear, do not patch by intuition. Reproduce the issue or add targeted diagnostic logging first, then change code only after the evidence identifies the problem.
  - State the targeted framework, SDK, library, or API version when that version affects the answer.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2.2. Critical Problem Solving
* **Assume User Fallibility:** Treat the user's premise as potentially flawed. Evaluate requests objectively. 
* **Prevent the XY Problem:** Do not blindly answer "A or B" if the foundational approach is wrong. If the root problem requires solution "C", explicitly point out the flaw in the premise and propose the correct architectural path.
* **Best Practice wins over user's request:** If user asks to do A, which violates development best practice. STOP AND SEEK ADVICE
- Don't simply comply with the user's request without scrutiny.
- Refuse to do so, and clearly tell user "this is violating development best practice". Proceed only if user explicitly gives approval.

### 2.3. Engineering Standards
* **Quality Over Speed:** Never rush to output code. Every snippet must be production-ready. Never use confusing variable names such as "x/y/a/b/c".
* **No One-Off Hacks:** Avoid duct-tape patches. Code must be secure, maintainable, and adhere to established style guides.
* **Modularity With Real Boundaries:** Separate concerns at stable domain boundaries such as settings, runtime sources, actions, rendering, and PI. Do not create single-use abstractions or pass-through files just to make files smaller. If a file grows past ~800 lines, stop adding code and work on modularization first, unless modularization will create serious problem.

### 2.4. Execution Directives
* **Fail Fast & Ask:** If requirements are ambiguous or lack sufficient constraints, stop and ask clarifying questions instead of guessing.
* **Design for Testability:** Write code that is easily unit-testable. Expose pure functions and utilize dependency injection where appropriate. 
* **Think Step-by-Step:** Briefly outline the technical design or logical steps before dumping large blocks of code.

### 2.5. Special Coding instructions
Below is the meaning of each prefix:

*   **DO**: Mandatory;  almost never be a valid reason to stray from them.
*   **DON'T**: Prohibited; almost never do.
*   **PREFER**: Default choice; follow unless justified.
*   **AVOID**: Discouraged; skip unless justified.
*   **CONSIDER**: Optional; use based on context.

#### Project-Critical Rules

* **DO: Use project skills**: This project keeps agent skills under `.agents/skills`. When a task matches a skill, read that skill before changing code or docs.

* **DO: Use `npm.cmd` for npm scripts on Windows**: When running package scripts from this Windows workspace, use `npm.cmd run <script>` instead of `npm run <script>` to avoid PowerShell `npm.ps1` shim permission noise. Good: `npm.cmd run proto:lint`, `npm.cmd run test:unit`. Bad: `npm run proto:lint`.

* **DO: Keep visual tests opt-in**: Do not run `npm.cmd run test:visual` during ordinary verification. Run visual tests only when changing SVG rendering, widget styles, Property Inspector visuals, or when the user explicitly asks for visual regression verification. Use `npm.cmd run test:visual:update` only after reviewing and accepting the visual change.

* **DO: Use descriptive names with the most descriptive noun last**: Never use confusing single-letter names or unclear abbreviations. Use names that expose ownership and responsibility, for example `retryLimit`, `pageCount`, and `metricStore`.

* **DO: Keep production TypeScript strongly typed**: Lint-enforced rules must prevent `any`, unsafe suppression comments, and production non-null assertions. Use `unknown` plus narrowing at boundaries.

* **DO: Language**:  No matter what language User communicates with you, you should always write code & code comment in English, unless it's for i18n to display text to end user.

* **DO: Commit messages start with an imperative verb**: Use `Verb + object`, with no vague scope prefix. Then, after a newline, explain WHY this change is made(not HOW). If the commit is for a bug fix / use case / any context that is unclear from the code itself, specifically mention so. However, only add a follow-up paragraph only when the context adds real value, instead of mechanically appending one to every commit.
Good: `Add Stream Deck action UUID constants`, `Rename Property Inspector settings type facade`, `Remove unused action kind wrapper`. 
Bad: `refactor(pi): action uuid`, `property inspector cleanup`, `updated files`.
Bad: Move archived documents to archived folder<newline>Archived documents are no longer in use. <- Unnecessary second line

* **DO: Guarantee backwards compatibility**: Code has launched in production, code must remain backward compatible unless compatibility would distort the design. Breaking changes are allowed only with a safe user-data migration. This applies to, but is not limited to:
  - Proto changes.
  - Plugin and helper changes: version skew is expected, user may update plugin without updating helper, and vice versa. Newer components must handle supported older counterparts safely.

* **PREFER: Simplicity First**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 100, rewrite it.

* **DO: Read source files as UTF-8 on Windows**: When using PowerShell `Get-Content` for source files, always pass `-Encoding UTF8 -LiteralPath` first. If non-ASCII text appears as mojibake, first suspect shell decoding, not file corruption.

#### Tooling Blockers And Workaround Discipline

* **DO: Treat tool, permission, environment, and dependency failures as design-affecting blockers when they change the implementation architecture.** If the best implementation depends on a tool, and you are blocked from using it. Stop and resolve the tool issue first instead of silently choosing a weaker architecture.

* **DON'T: Let operational friction decide architecture.** Do not introduce handwritten mirrors, duplicated source-of-truth data, broad adapters, manual parsers, or compatibility layers merely because a generator, CLI, dependency, permission, or sandbox step failed.

* **DO: Escalate or ask before using a structural workaround.** If a workaround would create a new abstraction, duplicate schema, weaken typing, bypass framework facilities, or add long-term maintenance cost, explain the blocker and ask for approval before proceeding.

* **DO: Prefer fixing the blocked path over approximating it.** First try the intended tool/library/framework path, then diagnose the failure, then request permission/escalation if needed. Only use a workaround when it is explicitly temporary, isolated, and documented.

* **DON'T: Hide temporary scaffolding inside production code.** Temporary fallbacks must be named as temporary, kept out of core architecture when possible, and removed before finalizing unless the user explicitly accepts them.

* **DO: Re-evaluate after any workaround.** Before final response, identify whether any workaround was introduced due to tooling friction. If yes, either remove it, replace it with the intended implementation, or clearly report it as unresolved technical debt.
