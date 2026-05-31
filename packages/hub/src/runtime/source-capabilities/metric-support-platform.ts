/**
 * Platform vocabulary used by static source capability tables.
 *
 * Keep the runtime's platform vocabulary at source-routing boundaries.
 * `other` is only for unknown host strings at UI/runtime boundaries.
 */
export type MetricSupportPlatform = NodeJS.Platform | "other";
