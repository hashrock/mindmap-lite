import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes } from "../../../db/schema";
import { eq } from "drizzle-orm";
import MindmapViewer from "../../../islands/mindmap-viewer";

export default createRoute(async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const note = await db.select().from(notes).where(eq(notes.id, id)).get();

  if (!note) {
    return c.render(
      <div class="max-w-4xl mx-auto px-4 py-8">
        <p>ノートが見つかりません。</p>
        <a href="/notes" class="text-blue-600 underline">
          一覧に戻る
        </a>
      </div>
    );
  }

  if (!note.isPublic) {
    return c.render(
      <div class="max-w-4xl mx-auto px-4 py-8">
        <p>このノートは非公開です。</p>
        <a href="/notes" class="text-blue-600 underline">
          一覧に戻る
        </a>
      </div>
    );
  }

  return c.render(
    <div class="h-screen flex flex-col">
      <header class="flex items-center gap-4 px-4 py-2 border-b bg-white">
        <a href="/notes" class="text-blue-600 hover:underline text-sm">
          &larr; 一覧
        </a>
        <h1 class="font-semibold">{note.title}</h1>
      </header>
      <div class="flex-1">
        <MindmapViewer initialContent={note.content} readOnly={true} />
      </div>
    </div>
  );
});
