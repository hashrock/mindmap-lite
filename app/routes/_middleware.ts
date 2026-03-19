import { createMiddleware } from "hono/factory";
import { getSession } from "../utils/session";

export default [
  createMiddleware(async (c, next) => {
    const user = await getSession(c);
    c.set("user", user);
    await next();
  }),
];
