import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes } from "../../db/schema";

export const GET = createRoute((c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/auth/google");

  return c.render(
    <div class="max-w-2xl mx-auto px-4 py-8">
      <h1 class="text-xl font-bold mb-6">新規ノート作成</h1>
      <form method="POST" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">タイトル</label>
          <input
            name="title"
            type="text"
            class="w-full px-3 py-2 border rounded-lg"
            placeholder="ノートのタイトル"
            required
          />
        </div>
        <div>
          <label class="flex items-center gap-2 text-sm">
            <input name="isPublic" type="checkbox" value="1" />
            公開する
          </label>
        </div>
        <button
          type="submit"
          class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          作成
        </button>
      </form>
    </div>
  );
});

export const POST = createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/auth/google");

  const body = await c.req.parseBody();
  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const defaultContent = `トピック1\nトピック2`;

  await db.insert(notes).values({
    id,
    userId: user.id,
    title: (body.title as string) || "Untitled",
    content: defaultContent,
    isPublic: body.isPublic === "1",
    createdAt: now,
    updatedAt: now,
  });

  return c.redirect(`/notes/${id}/edit`);
});
