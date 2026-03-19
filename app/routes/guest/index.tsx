import { createRoute } from "honox/factory";
import MindmapEditor from "../../islands/mindmap-editor";

export default createRoute((c) => {
  return c.render(
    <div class="h-screen flex flex-col">
      <header class="flex items-center gap-4 px-4 py-2 border-b bg-white">
        <a href="/notes" class="text-blue-600 hover:underline text-sm">
          &larr; 一覧
        </a>
        <h1 class="font-semibold">ゲストエディタ</h1>
        <span class="text-xs text-gray-400">
          保存はされません（ローカルのみ）
        </span>
      </header>
      <div class="flex-1 overflow-hidden">
        <MindmapEditor />
      </div>
    </div>
  );
});
