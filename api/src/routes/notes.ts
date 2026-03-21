import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { notes, users } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { getSession } from "../utils/session";
import type { Env } from "../global.d";

const notesApi = new Hono<Env>();

// GET /api/notes — list public notes
notesApi.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const publicNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      isPublic: notes.isPublic,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      userName: users.name,
    })
    .from(notes)
    .leftJoin(users, eq(notes.userId, users.id))
    .where(eq(notes.isPublic, true))
    .orderBy(desc(notes.updatedAt));
  return c.json(publicNotes);
});

// GET /api/notes/my — list current user's notes
notesApi.get("/my", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = drizzle(c.env.DB);
  const myNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, user.id))
    .orderBy(desc(notes.updatedAt));
  return c.json(myNotes);
});

// GET /api/notes/:id — get a single note
notesApi.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);
  const note = await db.select().from(notes).where(eq(notes.id, id)).get();

  if (!note) return c.json({ error: "Not found" }, 404);

  const user = c.get("user");
  if (!note.isPublic && (!user || note.userId !== user.id)) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(note);
});

// POST /api/notes — create a note
notesApi.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{
    title?: string;
    content?: string;
    isPublic?: boolean;
  }>();
  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(notes).values({
    id,
    userId: user.id,
    title: body.title || "Untitled",
    content: body.content || "トピック1\nトピック2",
    isPublic: body.isPublic ?? false,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id }, 201);
});

// PUT /api/notes/:id — update a note
notesApi.put("/:id", async (c) => {
  const user = c.get("user");
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
notesApi.delete("/:id", async (c) => {
  const user = c.get("user");
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

export { notesApi };
