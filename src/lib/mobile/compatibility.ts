import { legacyMobileProtocolVersion, mobileProtocolStatus, mobileProtocolVersion, mobileUpdateUrlSchema } from "@nognog/domain";
import type { MobileCompatibility } from "@nognog/domain";

// Keep legacy protocol 1 supported until a demonstrated breaking change needs a new contract.
export const minimumSupportedMobileProtocol = 1;
export function mobileCompatibility(): MobileCompatibility {
  const safeUrl = (value: string | undefined) => {
    const parsed = mobileUpdateUrlSchema.safeParse(value?.trim());
    return parsed.success ? parsed.data : null;
  };
  return { minimumProtocol: minimumSupportedMobileProtocol, currentProtocol: mobileProtocolVersion,
    updateUrls: { android: safeUrl(process.env.MOBILE_ANDROID_UPDATE_URL), ios: safeUrl(process.env.MOBILE_IOS_UPDATE_URL) } };
}

export function inspectMobileProtocol(header: string | null, policy: MobileCompatibility = mobileCompatibility()) {
  if (header !== null && !/^[1-9]\d{0,3}$/.test(header)) return "invalid";
  return mobileProtocolStatus(header === null ? legacyMobileProtocolVersion : Number(header), policy);
}
