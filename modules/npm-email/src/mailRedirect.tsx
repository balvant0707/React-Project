// /mail was the first mailbox page; the mailbox is part of Notes (/inbox) now, old links and bookmarks still work (NPM App.tsx).
import { Navigate, useLocation } from "react-router-dom";

export function MailRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/inbox${search}`} replace />;
}
