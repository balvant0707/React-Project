// Copied from COMPASS app/src/lib/login.ts. Change: the reserved domain is platform-wide (login.rbp.invalid), not per app.
// GoTrue signs in with an e-mail address. A password account with a contact address uses that address; one without uses its
// username on a reserved domain that never receives mail (public.expected_login_email). Keep the domain equal to
// public.login_email.
const LOGIN_EMAIL_DOMAIN = 'login.rbp.invalid';

const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const loginEmail = (username: string) => `${normalizeUsername(username)}@${LOGIN_EMAIL_DOMAIN}`;

// What the person typed on the sign-in page, as the GoTrue address: an input with "@" is the address itself (a contact
// address, or a username's own address from an activation), anything else is a username. The database keeps the account
// on the same address (public.expected_login_email), so no lookup happens before sign-in.
export const signInAddress = (input: string) => {
  return input.includes("@") ? input.trim().toLowerCase() : loginEmail(input);
};

// The QR code on an activation sheet: the code travels in the fragment, so it never reaches a server log.
export const activationUrl = (username: string, code: string) =>
  `${window.location.origin}/activate#u=${encodeURIComponent(username)}&c=${encodeURIComponent(code)}`;
