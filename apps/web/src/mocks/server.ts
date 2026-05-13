import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

export const mswServer = setupServer(...handlers);
