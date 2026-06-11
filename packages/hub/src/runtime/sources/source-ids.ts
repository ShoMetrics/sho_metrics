/** Source id for the built-in Node/systeminformation fallback source. */
export const NODE_SYSTEM_SOURCE_ID = "node-system";

/** Source id for the installed Windows helper source. */
export const WINDOWS_HELPER_SOURCE_ID = "windows-helper";

/** Source id for widget-local Custom HTTP metric definitions. */
export const CUSTOM_HTTP_SOURCE_ID = "custom-http";

/** Source scope used for telemetry collected from the current machine. */
export const LOCAL_SOURCE_SCOPE_ID = "local";

/** Reserved source profile id for the best available local source chain. */
export const BUILT_IN_LOCAL_AUTO_SOURCE_PROFILE_ID = "local:auto";

/** Reserved source profile id for the installed Windows helper only. */
export const BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID = "local:windows-helper";

/** Reserved source profile id for the built-in Node/systeminformation source only. */
export const BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID = "local:node-system";

/** Reserved prefix for built-in local source profile ids. */
export const BUILT_IN_LOCAL_SOURCE_PROFILE_ID_PREFIX = "local:";

/** Runtime source id prefix for user-defined source profile instances. */
export const USER_SOURCE_PROFILE_SOURCE_ID_PREFIX = "source-profile:";

/** Builds the registry source id for a user-defined source profile instance. */
export function buildUserSourceProfileSourceId(sourceProfileId: string): string {
    return `${USER_SOURCE_PROFILE_SOURCE_ID_PREFIX}${sourceProfileId}`;
}
