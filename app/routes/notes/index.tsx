import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes, users } from "../../db/schema";
import { desc, eq, and } from "drizzle-orm";

export default createRoute(async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");

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

  // Get user's own notes if logged in
  const myNotes = user
    ? await db
        .select()
        .from(notes)
        .where(eq(notes.userId, user.id))
        .orderBy(desc(notes.updatedAt))
    : [];

  return c.render(
    <div class="max-w-4xl mx-auto px-4 py-8">
      <header class="flex items-center justify-between mb-8">
        <h1 class="text-2xl font-bold">Mindmap Lite</h1>
        <div class="flex items-center gap-3">
          {user ? (
            <div class="flex items-center gap-3">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt=""
                  class="w-8 h-8 rounded-full"
                />
              )}
              <span class="text-sm">{user.name}</span>
              <a
                href="/auth/logout"
                class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                ログアウト
              </a>
            </div>
          ) : (
            <>
              <a
                href="/guest"
                class="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 transition"
              >
                ゲストで試す
              </a>
              <a
                href="/auth/google"
                class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Googleでログイン
              </a>
            </>
          )}
        </div>
      </header>

      {user && (
        <section class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">マイノート</h2>
            <a
              href="/notes/new"
              class="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              + 新規作成
            </a>
          </div>
          {myNotes.length === 0 ? (
            <p class="text-gray-500">ノートがありません。</p>
          ) : (
            <div class="grid gap-3">
              {myNotes.map((note) => (
                <div class="flex items-center gap-2 bg-white rounded-lg border hover:border-blue-400 transition">
                  <a
                    href={`/notes/${note.id}/edit`}
                    class="flex-1 p-4"
                  >
                    <div class="flex items-center justify-between">
                      <h3 class="font-medium">{note.title}</h3>
                      <span
                        class={`text-xs px-2 py-0.5 rounded ${note.isPublic ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}
                      >
                        {note.isPublic ? "公開" : "非公開"}
                      </span>
                    </div>
                    <div class="text-sm text-gray-500 mt-1">
                      {new Date(note.updatedAt).toLocaleDateString("ja-JP")}
                    </div>
                  </a>
                  <form
                    method="POST"
                    action={`/notes/${note.id}/delete`}
                    class="pr-3"
                    onsubmit="return confirm('このノートを削除しますか？')"
                  >
                    <button
                      type="submit"
                      class="p-2 text-gray-400 hover:text-red-500 transition"
                      title="削除"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 class="text-lg font-semibold mb-4">公開ノート</h2>
        {publicNotes.length === 0 ? (
          <p class="text-gray-500">まだ公開ノートがありません。</p>
        ) : (
          <div class="grid gap-3">
            {publicNotes.map((note) => (
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
