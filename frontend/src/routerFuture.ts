// React Router v7 flags, set explicitly so the router does not warn about them.
// v7_startTransition stays off: with it, logging out redirects to /login?next=/app instead of
// /login, because the logout state change renders before the navigation.
export const ROUTER_FUTURE = { v7_startTransition: false, v7_relativeSplatPath: true } as const;
