import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes, users } from "../../db/schema";
import { desc, eq } from "drizzle-orm";

export default createRoute(async (c) => {
  const db = drizzle(c.env.DB);
  const allNotes = await db
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

  return c.render(
    <div class="max-w-4xl mx-auto px-4 py-8">
      <header class="flex items-center justify-between mb-8">
        <h1 class="text-2xl font-bold">Mindmap Lite</h1>
        <a
          href="/guest"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          ゲストで試す
        </a>
      </header>

      <section>
        <h2 class="text-lg font-semibold mb-4">公開ノート</h2>
        {allNotes.length === 0 ? (
          <p class="text-gray-500">まだノートがありません。</p>
        ) : (
          <div class="grid gap-4">
            {allNotes.map((note) => (
              <a
                href={`/notes/${note.id}`}
                class="block p-4 bg-white rounded-lg border hover:border-blue-400 transition"
              >
                <h3 class="font-medium">{note.title}</h3>
                <div class="text-sm text-gray-500 mt-1">
                  {note.userName && <span>by {note.userName}</span>}
                  <span class="ml-2">
                    {new Date(note.updatedAt).toLocaleDateString("ja-JP")}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
});
