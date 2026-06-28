# Manual Refresh Trigger Implementation Plan

Date: 2026-06-28

This document is the implementation standard for manual widget refresh. A
0-context agent should be able to start from this file. If the live code and
this document disagree, stop and resolve the drift before coding.

## Product Contract

- A supported user interaction requests a refresh for the current widget.
- Keypad actions use `onKeyDown`.
- Encoder/touch-strip actions use physical `onDialDown`. Touch tap is not bound
  in v1.
- Dense refreshes the whole widget. It must not refresh only battery rows or a
  selected row.
- Stacked Metric key press advances to the next slot and requests refresh for
  the whole stacked widget. Encoder push refreshes, and encoder rotation
  continues to switch metrics.
- Feedback is a small upper-right frame badge using the existing frame badge
  visual language. It is a static refresh icon, not an animated loader.
- The feedback badge is an interaction acknowledgement: it means the refresh
  request was accepted and sent to background collection. It is not a guarantee
  that the displayed value changed or that hardware returned a fresh value.
- The feedback badge must remain visible for at least 300 ms. If collection is
  still pending after that, keep the badge visible until the request settles.
- This feature is not battery-only. Battery motivates it, but every supported
  metric widget should use the same interaction contract.
- Runtime may return several diagnostic aggregate statuses, but the user-visible
  indicator must collapse them into a small set of states: request accepted,
  request finished, and no-op when there is no live subscriber.

## Runtime Contract

- Manual refresh is a collection trigger, not a source read.
- The trigger asks active background collector groups for the current
  subscriber to refresh now.
- The trigger must go through `CollectorGroupRunner` semantics:
  - single-flight in-flight suppression;
  - backoff;
  - generation guards;
  - source-scoped `MetricStore` ingest;
  - runner-owned timer rescheduling.
- Actions must not call source clients directly.
- Actions must not call `refreshReadPlanOnce` for manual refresh.
- `refreshReadPlanOnce` remains a lifecycle-only option/cache refresh escape
  hatch unless an existing caller is deliberately migrated and tested.
- A future device/source notification should use the same trigger path to ask
  collection to pull again. It must not push values directly into
  `MetricStore`.
- The trigger does not decide whether hardware is unavailable. Sources must
  report current values or unavailable reports during the read.
- Manual refresh does not guarantee a newer hardware value. It only asks the
  collection runner to pull now. If a source or helper returns cached data, the
  indicator can acknowledge the request while the displayed value stays the
  same.

## Non-Goals

- Do not implement OS/device notification watchers in this change.
- Do not add push-to-store behavior.
- Do not add source-specific invalidation heuristics.
- Do not migrate unrelated `refreshReadPlanOnce` callers unless a caller is
  intentionally part of the manual-refresh path.
- Do not add per-domain refresh behavior. Manual refresh is subscriber/widget
  scoped.

The `"sourceNotification"` reason in Step 1 is only the future entry vocabulary.
It preserves the intended contract that manual press and future source
notifications are both "please pull now" signals. Source truth remains
separate: the source read decides whether the metric is value, unavailable,
retained, or no-data. This reason belongs to subscriber fan-out and diagnostics;
it must not be passed through to runner scheduling unless runner logs begin
using it directly.

## Step Count

This plan intentionally has six steps. Do not collapse it below six without
rewriting the architecture boundary.

- The old separate "connect action indicator state to render options" step is
  folded into the action step because action lifecycle owns both indicator state
  and render-option handoff.
- Runtime vocabulary, runner scheduling, supervisor fan-out, composition-root
  API, rendering, and action integration remain separate owners.
- Merging runner scheduling with supervisor fan-out is not acceptable: timer
  semantics and subscriber topology fail in different ways and need different
  tests.
- Merging supervisor fan-out with the background collection public API is not
  acceptable: actions must call the composition root, not learn supervisor
  internals.
- Merging renderer overlay code with action gesture handling is not acceptable:
  rendering must remain a pure function of render-facing options.

## Existing Facts To Verify Before Coding

These facts are true for the current implementation. Verify them first; if any
are false, update this plan before implementing.

- `CollectorGroupRunner.refreshNow()` already owns source reads, in-flight
  suppression, backoff, generation checks, and `MetricStore` ingest.
- `CollectorGroupRunner.scheduleNextRefresh()` uses `setTimeout` after a
  refresh, not fixed `setInterval` stacking.
- `CollectorGroupRunner.scheduleImmediateRefresh()` is currently settings-change
  machinery. It clears a scheduled timer and, if a read is in flight, queues one
  trailing refresh.
- `BackgroundMetricCollection.refreshReadPlanOnce()` bypasses runner backoff,
  in-flight dedupe, generation checks, and render callbacks. It is not the
  manual refresh path.
- `BackgroundCollectionBinding` binds one action/subscriber to background
  collection and owns only the action render timer. It must not poll sources.
- `MetricAction` is the common action lifecycle shell for single, dense, and
  stacked metric actions.
- `StackedMetric` overrides `onKeyDown` and `onDialRotate` for slot switching.
- `renderMetricFrame()` already accepts frame overlays.
- `composeMetricViewFrame()` currently exposes Stacked's overlay explicitly and
  must stay explicit, not become a generic overlay bag.

## Step 1: Add The Collection Refresh Request Types

Owner: `packages/hub/src/runtime/metric-collection`.

Expected LOC:

- Production: 20-40
- Tests: 0-20

Implement:

- Add a collection-owned reason type:

  ```ts
  export type MetricCollectionRefreshReason =
      | "manualInteraction"
      | "sourceNotification";
  ```

- Add shared result/aggregate types for subscriber refresh. Use names that say
  "subscriber refresh", not "manual refresh", because source notifications will
  use the same path later.

Required subscriber-level aggregate semantics to add:

These are not current runner statuses. They are the public result returned by
subscriber refresh fan-out. They should be derived from existing
`CollectorGroupRunner` results such as `refreshed`, `failed`,
`skippedPending`, `skippedBackoff`, `skippedSuperseded`, and `stopped`.

- `missingSubscriber`: no live runner currently contains the subscriber.
- `refreshed`: every targeted live runner refreshed successfully.
- `pending`: no runner refreshed and at least one runner was already pending.
- `backoff`: no runner refreshed and at least one runner was in backoff.
- `partial`: at least one runner refreshed and at least one runner did not.
- `skipped`: all targeted runners were stopped, superseded, or otherwise
  inactive.
- `failed`: no runner refreshed and at least one runner failed.

Aggregate precedence is part of the contract:

- if at least one runner refreshed and at least one runner did not, return
  `partial` regardless of the non-refreshed statuses;
- otherwise, when no runner refreshed, use `failed > pending > backoff >
  skipped`.

Do not include source-specific data in these public aggregate types. If logs
need source details, log them inside runner/supervisor, where collector-group
context already exists.

Do not expose these aggregate statuses as separate UI states. Actions may use
them for diagnostics and tests, but the visible badge should only communicate
that a request was accepted and then ended, or do nothing when there is no live
subscriber.

Do not merge this with Step 2. Step 1 defines the API vocabulary. Step 2 changes
runner scheduling semantics. Combining them makes review miss whether the names
match the behavior.

## Step 2: Add Runner-Owned On-Demand Refresh

Owner: `packages/hub/src/runtime/metric-collection/collector-group-runner.ts`.

Expected LOC:

- Production: 50-90
- Tests: 120-180

Implement:

- Add a public runner method, for example `requestOnDemandRefresh()`.
- It must be the only method used by manual/source-notification triggers.
- It may call the same private read path as `refreshNow()`, but it must own
  timer state before and after the read.
- Do not pass `MetricCollectionRefreshReason` into the runner unless the runner
  itself starts logging or otherwise using that reason. Runner scheduling is
  reason-independent; Step 3 owns fan-out reason handling.

Required behavior:

- If the runner is stopped, return `stopped`.
- If a source read is already in flight, do not start another read. Return the
  existing pending/skipped state.
- If backoff blocks the attempt, return `skippedBackoff`.
- If the refresh can start now, clear any later scheduled normal timer before
  starting it.
- After the on-demand refresh finishes, schedule the next normal timer from the
  on-demand refresh completion time.
- Do not reuse `shouldRefreshAfterPendingUpdate` for repeated user presses.
  That flag is for settings-change trailing refreshes, not interaction spam.
- Preserve the existing settings-change behavior where a settings update during
  an in-flight read coalesces one trailing immediate refresh.

Required tests:

- On-demand refresh starts one source read and ingests through `MetricStore`.
- On-demand refresh clears a later scheduled timer.
- On-demand refresh schedules the next normal timer after completion.
- On-demand refresh does not start a second source read while pending.
- On-demand refresh respects backoff.
- On-demand refresh does not break settings-change trailing refresh.
- Superseded/stopped generation behavior still prevents stale ingest.

Do not merge this with Step 3. Runner scheduling and supervisor fan-out are
different owners. If they are reviewed together, it becomes too easy to hide a
timer regression behind subscriber routing.

## Step 3: Fan Out Refresh By Subscriber

Owner: `packages/hub/src/runtime/metric-collection/collector-group-supervisor.ts`.

Expected LOC:

- Production: 45-80
- Tests: 100-160

Implement:

- Add `requestSubscriberRefresh(subscriberId, reason)` to
  `CollectorGroupSupervisor`.
- It must inspect live `CollectorGroupRunner` instances and select every runner
  whose current planned collector group includes the subscriber id.
- It must call the Step 2 runner method for each selected runner.
- It must aggregate runner results into the Step 1 subscriber result.

Required behavior:

- One subscriber can belong to multiple collector groups. Refresh all of them.
- Dense therefore refreshes the whole widget automatically because Dense
  registers all row metric subscriptions under the same subscriber id.
- A missing subscriber must be a non-throwing `missingSubscriber` result.
- Do not re-plan read plans here.
- Do not resolve source clients here except through existing runner ownership.

Required tests:

- Missing subscriber returns `missingSubscriber`.
- Subscriber in one group calls exactly that runner.
- Subscriber in multiple groups calls every matching runner.
- Non-matching groups are not called.
- Mixed runner statuses aggregate to `partial`.
- Pending-only and backoff-only cases aggregate to `pending` and `backoff`.

Do not merge this with Step 4. Supervisor is the owner of live runner topology.
`BackgroundMetricCollection` is the composition root. Keeping them separate
prevents actions from learning supervisor internals later.

## Step 4: Expose A Background Collection Entry Point

Owner: `packages/hub/src/runtime/metric-collection/background-metric-collection.ts`.

Expected LOC:

- Production: 20-40
- Tests: 30-60

Implement:

- Add `requestSubscriberRefresh(subscriberId, reason)` to
  `BackgroundMetricCollection`.
- This method should delegate to `CollectorGroupSupervisor`.
- It should be the only public runtime API actions use for manual refresh.

Required behavior:

- Do not call `refreshReadPlanOnce`.
- Do not read source descriptors.
- Do not mutate action runtime cache.
- Do not render.
- Do not write to settings.

Required tests:

- Delegates subscriber id and reason to the supervisor.
- Returns the supervisor aggregate result.
- `refreshReadPlanOnce` behavior remains unchanged.

Do not merge this with Step 5. Step 4 is runtime collection plumbing. Step 5 is
Stream Deck action interaction. Mixing them creates UI concepts in the runtime
entry point.

## Step 5: Add Explicit Refresh Overlay Rendering

Owner: `packages/hub/src/view-rendering`.

Expected LOC:

- Production: 60-110
- Tests: 60-120

Implement:

- Add a refresh overlay renderer beside the existing Stacked indicator renderer.
- Extend `BaseMetricRenderOptions` with an explicit refresh overlay option,
  for example `refreshIndicator?: MetricRefreshIndicator`.
- Keep Stacked indicator and refresh indicator as named options. Do not replace
  them with a generic overlay array or options bag.
- `composeMetricViewFrame()` should pass zero, one, or both explicit overlay
  fragments to `renderMetricFrame()`.
- The badge should be frame-anchored, lower-left, and independent of the metric
  body viewport.
- Use the same surface/text/divider readability approach as
  `renderStackedMetricIndicator`.

Required visual behavior:

- Static icon only.
- No animation timers.
- No per-frame animation render loop.
- Works for square key and touch strip render sizes.
- Does not alter body viewports or metric layout.

Required tests:

- No refresh indicator renders when option is absent.
- Refresh indicator renders upper-right when option is present.
- Stacked indicator still renders lower-right.
- Both indicators can render in one frame without replacing each other.
- Body viewport output is unchanged when only the overlay option changes.

Do not merge this with Step 6. Rendering must remain a pure function of
render-facing options. It must not know action ids, subscriber ids, refresh
promises, or SDK gesture events.

## Step 6: Wire Shared Action Gestures And Indicator State

Owner: `packages/hub/src/actions/metric-action.ts`.

Expected LOC:

- Production: 120-190
- Tests: 180-300

Implement:

- Add shared manual refresh handling to `MetricAction`.
- Keypad: override `onKeyDown` and request refresh for `event.action.id`.
- Touch strip: override `onDialDown` and request refresh for `event.action.id`.
- Touch tap is intentionally unbound in v1.
- The call must use `backgroundMetricCollection.requestSubscriberRefresh`.
- Add action-owned transient indicator state keyed by action id.
- Repeated presses while the action already has a manual refresh pending should
  not create multiple overlay flickers.
- `onWillDisappear` must clear indicator state and any lifecycle-owned timer.
- `StackedMetric` key down must keep its existing slot switch and then reuse
  the shared manual refresh path. Dial down should inherit the shared manual
  refresh behavior.
- Pass the action-owned indicator state into render options using the explicit
  Step 5 refresh indicator option.
- When manual refresh is requested, render once with refresh indicator visible.
- When the awaited aggregate result settles and the 300 ms minimum visible
  duration has elapsed, render again to clear the indicator.

Required behavior:

- Runner coalescing and action coalescing are different concerns. The runner
  owns read de-dupe and skip-if-pending. The action owns only visual flicker
  suppression for the transient badge. Do not reimplement source-read de-dupe
  in `MetricAction`.
- Do not add a timeout timer by default. `requestSubscriberRefresh` should
  resolve with a concrete aggregate status. Add a timeout only if a real hang
  risk is proven during implementation, and then document what owns cleanup.
- A widget with no active subscription should show no error and may render no
  indicator if the runtime returns `missingSubscriber`.
- A pending/backoff/skipped result can still acknowledge the interaction with
  the transient badge. Do not invent source values.
- Repeated interactions while feedback is visible must not start another action
  request. They are coalesced by action-owned feedback state. Runner-level
  pending/backoff/coalescing remains separate.
- Do not change action settings on press/tap.
- Do not call `refreshMetricKeys`.
- Do not special-case battery.
- Do not special-case Dense rows.
- Rendering still reads metric values from `MetricStore`.
- Manual refresh completion does not directly push source results to the
  renderer.

Required tests:

- Base metric action key down calls collection refresh.
- Base metric action dial down calls collection refresh.
- Repeated key down while pending coalesces indicator state without adding
  source-read de-dupe in the action.
- Indicator state remains visible when the awaited refresh request settles
  before the 300 ms minimum visible duration.
- Indicator state remains visible after 300 ms while the awaited refresh
  request is still pending.
- Indicator state clears on `onWillDisappear`.
- A normal metric action passes refresh indicator options while pending.
- Dense passes refresh indicator options while pending.
- A `missingSubscriber` result does not crash and does not require a visible
  badge.
- Pending/backoff/skipped aggregate statuses do not create separate UI states.
- Stacked passes refresh indicator options while manual refresh is pending.
- Stacked key down switches slots and requests collection refresh.
- Stacked dial down requests collection refresh without switching slots.

Do not merge this with Step 5. Step 5 proves the renderer can draw a supplied
state. Step 6 proves actions create, clear, and pass that state at the right
lifecycle points.

## Final Verification Checklist

Run targeted tests for each changed owner. At minimum:

- `collector-group-runner.test.ts`
- `collector-group-supervisor.test.ts`
- `background-metric-collection.test.ts`
- `metric-action.test.ts`
- `stacked-metric.test.ts`
- `metric-view-frame.test.ts`
- action tests for Dense and at least one single metric action path

Manual validation:

- Battery widget with long polling visibly acknowledges press/tap.
- A 1-second metric does not start overlapping source reads when pressed
  repeatedly.
- Dense with mixed metrics refreshes as one widget.
- Stacked key press switches slots and refreshes.
- Stacked dial rotation still switches slots.
- Stacked encoder push refreshes.
- Touch-strip physical press refreshes a non-Stacked action.
- Refresh badge appears upper-right and clears.
- Stacked slot badge remains lower-right.

## Manual Validation Notes

Validated on 2026-06-28 with temporary action logs after commit `d285092`.

- CPU rapid presses: 138 accepted requests, 123 repeated interactions ignored
  while feedback was visible, and 138 request-settled/minimum-visible/cleared
  lifecycles. Every accepted request cleared.
- Battery/System rapid presses: 19 accepted requests, 144 repeated
  interactions ignored while feedback was visible, and 19
  request-settled/minimum-visible/cleared lifecycles. Every accepted request
  cleared.
- Alternating CPU and Battery/System presses showed independent per-action
  coalescing. CPU continued to accept new requests between Battery/System slow
  refresh windows; Battery/System repeated presses were ignored until its
  pending feedback cleared.
- CPU requests settled before the 300 ms minimum visible duration in all
  observed cases. The badge stayed visible until the minimum elapsed.
- Battery/System requests usually outlived the 300 ms minimum visible duration.
  The badge stayed visible until the request settled.
- No stuck badge, missing clear, timer leak, or cross-action blocking was
  observed.

These notes describe action feedback behavior only. The throttled
`subscriberRefresh` debug log is not one line per accepted interaction and must
not be used as a request count.

## Drift Alarms

Stop and ask before continuing if implementation requires any of these:

- calling source clients directly from an action;
- using `refreshReadPlanOnce` for manual interaction;
- adding row-level Dense refresh;
- adding battery-only behavior;
- adding a generic renderer overlay bag;
- persisting refresh state in settings;
- pushing source results directly into `MetricStore` from a notification;
- removing Stacked key press or dial rotation slot-navigation semantics;
- adding an animation loop for the badge;
- letting `MetricAction` branch on metric domain to decide refresh behavior.

If a step exceeds the expected LOC by more than 2x, stop and reassess the
boundary. That usually means the step absorbed another owner or exposed drift
from this plan.
