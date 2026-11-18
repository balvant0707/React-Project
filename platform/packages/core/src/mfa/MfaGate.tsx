import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Spin, message } from "antd";
import { MFA_ENFORCED, MFA_REQUIRED_EVENT } from "../supabase";
import { getMfaRequirement } from "./mfa";

const FullPageSpin = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
    <Spin size="large" />
  </div>
);

// Wraps the app layout and checks once per login: blocks the app until MFA is enrolled and challenged (MFA_ENFORCED).
// The friendly half only: the database refuses a session without aal2 itself.
export const MfaGate = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(!MFA_ENFORCED);

  // A request refused for a missing second factor (MFA_REQUIRED_EVENT, any caller); one check and one message at a time.
  useEffect(() => {
    let busy = false;
    const onMfaRequired = async () => {
      if (busy) {
        return;
      }
      busy = true;
      try {
        if (!MFA_ENFORCED) {
          message.error({
            key: "mfa-required",
            duration: 0,
            content:
              "The database requires a second factor, but this local app is configured without one. Run the local seed of the app against the local database.",
          });
        } else if ((await getMfaRequirement()) !== "none") {
          navigate("/mfa", { replace: true });
        } else {
          message.error({
            key: "mfa-required",
            duration: 0,
            content:
              "The server does not accept this sign-in as a second factor (Microsoft sign-in is not trusted for it). Sign in with password and authenticator code instead.",
          });
        }
      } finally {
        busy = false;
      }
    };
    window.addEventListener(MFA_REQUIRED_EVENT, onMfaRequired);
    return () => window.removeEventListener(MFA_REQUIRED_EVENT, onMfaRequired);
  }, [navigate]);

  useEffect(() => {
    if (!MFA_ENFORCED) {
      return;
    }
    let cancelled = false;
    getMfaRequirement().then((requirement) => {
      if (cancelled) {
        return;
      }
      if (requirement === "none") {
        setChecked(true);
      } else {
        navigate("/mfa", { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!checked) {
    return <FullPageSpin />;
  }
  return <>{children}</>;
};
