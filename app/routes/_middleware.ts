import { createMiddleware } from "hono/factory";
import { getSession } from "../utils/session";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

const DEV_USER = {
  id: "dev-user",
  email: "dev@localhost",
  name: "Dev User",
  avatarUrl: "",
};

export default [
  createMiddleware(async (c, next) => {
    // Local dev auth bypass
    if (c.env.DEV_BYPASS_AUTH) {
      // Ensure dev user exists in DB
      const db = drizzle(c.env.DB);
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.id, DEV_USER.id))
        .get();
      if (!existing) {
        await db.insert(users).values({
          id: DEV_USER.id,
          email: DEV_USER.email,
          name: DEV_USER.name,
          avatarUrl: DEV_USER.avatarUrl,
        });
      }
      c.set("user", DEV_USER);
      await next();
      return;
    }

    const user = await getSession(c);
    c.set("user", user);
    await next();
  }),
];
