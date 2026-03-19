import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes } from "../../../db/schema";
import { desc, eq } from "drizzle-orm";

// GET /api/notes - list public notes
export const GET = createRoute(async (c) => {
  const db = drizzle(c.env.DB);
  const allNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.isPublic, true))
    .orderBy(desc(notes.updatedAt));
  return c.json(allNotes);
});

// POST /api/notes - create a note
export const POST = createRoute(async (c) => {
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
    title: body.title || "Untitled",
    content: body.content || "",
    isPublic: body.isPublic ?? false,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id }, 201);
});
