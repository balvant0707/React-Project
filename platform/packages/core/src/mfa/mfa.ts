import { supabaseClient } from "../supabase";

export type MfaRequirement = "none" | "enroll" | "challenge";

// "enroll": no verified TOTP factor yet; "challenge": the session is not aal2 yet. Entra SSO sessions (amr "oauth") count
// as done (app_settings.sso_satisfies_mfa). An API error means "enroll": an unknown state must not grant access.
export async function getMfaRequirement(): Promise<MfaRequirement> {
  const { data, error } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    return "enroll";
  }
  if (data.currentAuthenticationMethods?.some((entry) => typeof entry !== "string" && entry.method === "oauth")) {
    return "none";
  }
  if (data.nextLevel !== "aal2") {
    return "enroll";
  }
  if (data.currentLevel !== data.nextLevel) {
    return "challenge";
  }
  return "none";
}
