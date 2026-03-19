import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "../../../../utils/session";

// PUT /api/notes/:id - update a note
export const PUT = createRoute(async (c) => {
  const user = await getSession(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, id)).get();
  if (!note || note.userId !== user.id) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    content?: string;
    isPublic?: boolean;
  }>();

  await db
    .update(notes)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(notes.id, id));

  return c.json({ ok: true });
});

// DELETE /api/notes/:id
export const DELETE = createRoute(async (c) => {
  const user = await getSession(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, id)).get();
  if (!note || note.userId !== user.id) {
    return c.json({ error: "Not found" }, 404);
  }

  await db.delete(notes).where(eq(notes.id, id));
  return c.json({ ok: true });
});
