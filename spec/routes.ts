// The routes the invariants run against. When you add a page, add its route
// here, or the invariants stop covering it.
//
// /plan/demo/ is a dynamic route, so it only resolves because the boot seed
// creates a plan at that slug in every database — including the throwaway one
// spec/global-setup.ts hands each test run.
export const ROUTES = ["/", "/plan/demo/", "/readme/"];
