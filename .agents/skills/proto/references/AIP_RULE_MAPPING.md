# Proto Skill Rule Source Mapping

This file is a source-anchor map for `.agents/skills/proto/SKILL.md`.

Do not read this file by default when writing proto. The skill text is the
source of truth. Use this map only when auditing or revising the skill.

`Project` means a ShoMetrics-specific decision, not a Google AIP requirement.

## Core Directives

| Skill rule | Source anchors |
| --- | --- |
| Syntax and tooling | AIP-191, Project |
| Package and layout | AIP-185, AIP-191 |
| Names and docs | AIP-140, AIP-190, AIP-192 |
| Units and scalar meaning | AIP-141, AIP-142, AIP-143, AIP-145 |
| Identifiers | AIP-122, AIP-126, AIP-148, Project |
| Repeated fields | AIP-144 |
| Enums | AIP-126, AIP-216, Project |
| Booleans and enums | AIP-126, AIP-216, Project |
| Presence and sparse intent | AIP-149, Project |
| Compatibility | AIP-180, AIP-203 |
| Sensitive fields | AIP-147 |
| Generic and encoded fields | AIP-146, AIP-213, Project |
| ProtoJSON | Project, ProtoJSON |
| Generated TypeScript | Project |

## Client Settings Proto Rules

| Skill rule | Source anchors |
| --- | --- |
| Sparse by design | Project |
| Presence matters | AIP-149, Project |
| Readable storage | Project, ProtoJSON |
| Resolver owns context | Project |
| No API resource ceremony | Project, AIP-121, AIP-122, AIP-148, AIP-158, AIP-161, AIP-203 |
| Open catalogs use IDs | AIP-126, Project |
| Do not model profiles as resources | Project |

## API / RPC Proto Rules

| Skill rule | Source anchors |
| --- | --- |
| Know the plane | AIP-111, AIP-121, AIP-130 |
| Resource shape | AIP-122, AIP-123, AIP-124, AIP-148, AIP-215 |
| RPC shape | AIP-127, AIP-131, AIP-132, AIP-133, AIP-134, AIP-135, AIP-136 |
| List and update from day one | AIP-132, AIP-158, AIP-160, AIP-161 |
| Field behavior and server-owned fields | AIP-129, AIP-203 |
| Errors and authorization | AIP-193, AIP-194, AIP-211 |
| Long work and bulk operations | AIP-151, AIP-152, AIP-153, AIP-164, AIP-165, AIP-231, AIP-233, AIP-234, AIP-235 |
| States and reachability | AIP-159, AIP-216, AIP-217 |
| Streaming last | AIP-130 |
| Intentional deviations | AIP-200, AIP-205 |
