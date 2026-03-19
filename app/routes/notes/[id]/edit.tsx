import { createRoute } from "honox/factory";
import { drizzle } from "drizzle-orm/d1";
import { notes } from "../../../db/schema";
import { eq } from "drizzle-orm";
import MindmapEditor from "../../../islands/mindmap-editor";

export default createRoute(async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/auth/google");

  const id = c.req.param("id");
  const db = drizzle(c.env.DB);
  const note = await db.select().from(notes).where(eq(notes.id, id)).get();

  if (!note || note.userId !== user.id) {
    return c.redirect("/notes");
  }

  return c.render(
    <div class="h-screen flex flex-col">
      <header class="flex items-center gap-4 px-4 py-2 border-b bg-white">
        <a href="/notes" class="text-blue-600 hover:underline text-sm">
          &larr; 一覧
        </a>
        <span class="font-semibold">{note.title}</span>
        <span
          class={`text-xs px-2 py-0.5 rounded ${note.isPublic ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}
        >
          {note.isPublic ? "公開" : "非公開"}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <span class="text-xs text-gray-400" id="save-status"></span>
        </div>
      </header>
      <div class="flex-1 overflow-hidden">
        <MindmapEditor
          noteId={note.id}
          initialContent={note.content}
          initialTitle={note.title}
          initialIsPublic={note.isPublic}
        />
      </div>
    </div>
  );
});
