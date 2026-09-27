import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Shared MSW server. Tests add per-test overrides with `server.use(...)`;
// they are reset after every test in setup.ts.
export const server = setupServer(...handlers);
