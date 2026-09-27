import { useLocation } from "react-router-dom";

/**
 * Placeholder for a destination route, so a test can assert where a component
 * navigated without rendering the real page:
 *
 *   <Route path="/professor/subjects" element={<RouteStub name="Subjects list" />} />
 *   await screen.findByRole("heading", { name: "Subjects list at /professor/subjects" });
 */
export function RouteStub({ name }: { name: string }) {
  const { pathname } = useLocation();
  return <h1>{`${name} at ${pathname}`}</h1>;
}
