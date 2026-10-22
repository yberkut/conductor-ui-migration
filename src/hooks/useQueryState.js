import { useLocation, useNavigate } from "react-router";
import { useQueryState as useQueryStateCore } from "use-location-state";

// Replaces `react-router-use-location-state`, which reached into React Router 5's `__RouterContext`
// and cannot run on React Router 7. That package was a thin adapter around `use-location-state`:
// all of the URL format (sorted keys, repeated keys for arrays, defaults stripped, other parameters
// and the hash kept) lives in `use-location-state` and is unchanged. Only this adapter is new.
//
// Kept exactly: the query string is read from the live location, so several setters called in
// the same tick each merge into the result of the one before; writes go through `replace` unless the
// caller asks for `{ method: "push" }`; the pathname and the hash are left alone.
export function useQueryState(itemName, defaultValue, queryStateOpts) {
  // Subscribes to location changes (back/forward, links), as the old hook did through the router context.
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const queryStringInterface = {
    // React Router 7 only exposes the location of the last render, so read the browser's (BrowserRouter only).
    getQueryString: () => window.location.search,
    setQueryString: (newQueryString, { method = "replace" }) => {
      navigate(
        { pathname, search: newQueryString, hash: window.location.hash },
        { replace: method === "replace" }
      );
    },
  };

  return useQueryStateCore(itemName, defaultValue, {
    queryStringInterface,
    ...queryStateOpts,
  });
}
