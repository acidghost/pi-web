declare const __PI_WEB_BUILD_COMMIT__: string | undefined;
declare const __PI_WEB_BUILD_VERSION__: string | undefined;

export const buildMetadata = Object.freeze({
  commit: typeof __PI_WEB_BUILD_COMMIT__ === "string" ? __PI_WEB_BUILD_COMMIT__ : "unknown",
  version:
    typeof __PI_WEB_BUILD_VERSION__ === "string" ? __PI_WEB_BUILD_VERSION__ : "SNAPSHOT-unknown",
});
