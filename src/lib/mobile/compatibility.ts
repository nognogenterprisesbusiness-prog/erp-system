import { legacyMobileProtocolVersion, mobileProtocolStatus, mobileProtocolVersion, mobileUpdateUrlSchema, mobileBuildStatus } from "@nognog/domain";
import type { MobileCompatibility } from "@nognog/domain";

// Keep installed protocol 1 clients supported until the replacement build is released.
export const minimumSupportedMobileProtocol = 1;
const configuredBuild = (value: string | undefined) => value && /^[1-9]\d{0,9}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const configuredProtocol = (value: string | undefined) => value === "2" ? 2 : minimumSupportedMobileProtocol;
export function mobileCompatibility(): MobileCompatibility {
  const safeUrl = (value: string | undefined) => {
    const parsed = mobileUpdateUrlSchema.safeParse(value?.trim());
    return parsed.success ? parsed.data : null;
  };
  return { minimumProtocol: configuredProtocol(process.env.MOBILE_MIN_PROTOCOL), currentProtocol: mobileProtocolVersion,
    updateUrls: { android: safeUrl(process.env.MOBILE_ANDROID_UPDATE_URL), ios: safeUrl(process.env.MOBILE_IOS_UPDATE_URL) },
    minimumBuilds: { android: configuredBuild(process.env.MOBILE_ANDROID_MIN_BUILD), ios: configuredBuild(process.env.MOBILE_IOS_MIN_BUILD) } };
}

export function inspectMobileProtocol(header: string | null, policy: MobileCompatibility = mobileCompatibility()) {
  if (header !== null && !/^[1-9]\d{0,3}$/.test(header)) return "invalid";
  return mobileProtocolStatus(header === null ? legacyMobileProtocolVersion : Number(header), policy);
}

export function inspectMobileBuild(platformHeader: string | null, buildHeader: string | null, policy: MobileCompatibility = mobileCompatibility()) {
  if (platformHeader !== null && platformHeader !== "android" && platformHeader !== "ios" && platformHeader !== "web") return "invalid";
  if (buildHeader !== null && !/^[1-9]\d{0,9}$/.test(buildHeader)) return "invalid";
  return mobileBuildStatus(platformHeader, buildHeader === null ? null : Number(buildHeader), policy);
}
