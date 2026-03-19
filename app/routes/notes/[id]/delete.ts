import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes } from "../../../db/schema";
import { eq } from "drizzle-orm";

export const POST = createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/auth/google");

  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, id)).get();
  if (!note || note.userId !== user.id) {
    return c.redirect("/notes");
  }

  await db.delete(notes).where(eq(notes.id, id));
  return c.redirect("/notes");
});
