import { Hono } from "hono";
import { googleAuth } from "@hono/oauth-providers/google";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { setSession, clearSession } from "../utils/session";
import type { Env } from "../global.d";

const auth = new Hono<Env>();

// GET /auth/google — start OAuth flow & handle callback
auth.get(
  "/google",
  googleAuth({
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  }),
  async (c) => {
    const googleUser = c.get("user-google");
    if (!googleUser?.email) {
      return c.redirect("/notes?error=auth");
    }

    const db = drizzle(c.env.DB);

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, googleUser.email))
      .get();

    let userId: string;
    if (existing) {
      userId = existing.id;
      await db
        .update(users)
        .set({
          name: googleUser.name || existing.name,
          avatarUrl: googleUser.picture || existing.avatarUrl,
        })
        .where(eq(users.id, existing.id));
    } else {
      userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: googleUser.email,
        name: googleUser.name || null,
        avatarUrl: googleUser.picture || null,
        createdAt: new Date().toISOString(),
      });
    }

    await setSession(c, {
      id: userId,
      email: googleUser.email,
      name: googleUser.name || "",
      avatarUrl: googleUser.picture || "",
    });

    return c.redirect("/notes");
  }
);

// GET /auth/me — return current user
auth.get("/me", (c) => {
  const user = c.get("user");
  return c.json({ user: user || null });
});

// GET /auth/logout
auth.get("/logout", (c) => {
  clearSession(c);
  return c.redirect("/notes");
});

export { auth };
