import { matchPath, useLocation } from "react-router";

// Stand-in for React Router 5's `useRouteMatch()`, for the `params` only.
//
// React Router 5 matched `decodeURI(pathname)` and handed out the captured text untouched, so a
// reserved character that arrived percent-encoded stayed encoded: "/taskDef/a%2Fb" gave
// `name === "a%2Fb"` (and `%3F`, `%23`, ... likewise). React Router 6+ decodes every param (`%2F`
// included), which changes the URL the API is asked for. This hook reproduces the old values.
//
// `pattern` is the route's own path (as written in App.jsx). Matching is prefix-based because the
// route has already matched when the page renders.
const PERCENT = "￿"; // hides "%" from matchPath, which would turn "%2F" back into "/"

export function useRouteMatch(pattern) {
  const { pathname } = useLocation();

  let decoded = pathname;
  try {
    decoded = decodeURI(pathname);
  } catch (e) {
    // malformed escape: keep the raw text
  }

  const match = matchPath(
    { path: pattern, end: false },
    decoded.replaceAll("%", PERCENT)
  );
  const params = {};
  for (const [key, value] of Object.entries(match ? match.params : {})) {
    params[key] =
      value === undefined ? undefined : value.replaceAll(PERCENT, "%");
  }
  return { params };
}
