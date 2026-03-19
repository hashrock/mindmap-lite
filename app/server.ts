import { showRoutes } from "hono/dev";
import { createApp } from "honox/server";
import { getSession } from "./utils/session";

const app = createApp();

// Set user on every request
app.use("*", async (c, next) => {
  const user = await getSession(c);
  c.set("user", user);
  await next();
});

showRoutes(app);

export default app;
