import { useState, useEffect, useRef, useCallback } from "hono/jsx";
import { parseTextToNodes } from "../utils/mindmapParser";
import type { MindMapNode, SelectionState } from "../types/MindMap";

const DEMO_TEXT = `使い方
  インデントで階層を作る
  Tabでインデント追加
  Shift+Tabでインデント削除
特徴
  リアルタイムプレビュー
  テキストベース
  シンプル`;

// Prepend title as root and indent all content by 2 spaces
function buildMindmapText(rootTitle: string, content: string): string {
  const lines = content.split("\n");
  const indented = lines.map((line) => (line.trim() === "" ? "" : "  " + line));
  return rootTitle + "\n" + indented.join("\n");
}

interface Props {
  noteId?: string;
  initialContent?: string;
  initialTitle?: string;
  initialIsPublic?: boolean;
}

export default function MindmapEditor({
  noteId,
  initialContent,
  initialTitle,
  initialIsPublic,
}: Props) {
  const [text, setText] = useState(initialContent || DEMO_TEXT);
  const [title, setTitle] = useState(initialTitle || "Mindmap Lite");
  const [isPublic, setIsPublic] = useState(initialIsPublic || false);
  const [saveStatus, setSaveStatus] = useState("");
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [selectionState, setSelectionState] = useState<SelectionState>({
    cursorPos: 0,
    selectionStart: 0,
    selectionEnd: 0,
    activeNodeId: null,
  });
  const [mobileTab, setMobileTab] = useState<"text" | "map">("text");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const konvaStageRef = useRef<any>(null);
  const saveTimerRef = useRef<any>(null);

  // Auto-save for logged-in notes
  const saveNote = useCallback(
    async (content: string, noteTitle?: string, pub?: boolean) => {
      if (!noteId) return;
      setSaveStatus("保存中...");
      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            title: noteTitle ?? title,
            isPublic: pub ?? isPublic,
          }),
        });
        if (res.ok) {
          setSaveStatus("保存済み");
        } else {
          setSaveStatus("保存失敗");
        }
      } catch {
        setSaveStatus("保存失敗");
      }
    },
    [noteId, title, isPublic]
  );

  // Debounced auto-save on text change
  useEffect(() => {
    if (!noteId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveNote(text);
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [text, noteId, saveNote]);

  // Parse text to nodes (prepend title as root)
  useEffect(() => {
    const rootTitle = title || "Mindmap";
    const mindmapText = buildMindmapText(rootTitle, text);
    const parsed = parseTextToNodes(mindmapText);
    setNodes(parsed);
  }, [text, title]);

  // Render mindmap with vanilla Konva
  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    import("konva").then((KonvaModule) => {
      const Konva = KonvaModule.default;
      const container = canvasRef.current!;

      if (konvaStageRef.current) {
        konvaStageRef.current.destroy();
      }

      const stage = new Konva.Stage({
        container,
        width: container.clientWidth,
        height: container.clientHeight,
        draggable: true,
      });
      konvaStageRef.current = stage;

      const layer = new Konva.Layer();
      stage.add(layer);

      const nodeMap: Record<string, MindMapNode> = {};
      nodes.forEach((n) => (nodeMap[n.id] = n));

      const textWidths = new Map<string, number>();
      nodes.forEach((node) => {
        const displayText = node.text === "" ? "empty" : node.text;
        const t = new Konva.Text({
          text: displayText,
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: node.text === "" ? "italic" : "normal",
        });
        textWidths.set(node.id, t.width());
      });

      // Draw connections
      nodes.forEach((node) => {
        node.children.forEach((childId) => {
          const child = nodeMap[childId];
          if (!child) return;
          const parentWidth = textWidths.get(node.id) || 100;
          const startX = node.x + parentWidth + 40;
          const startY = node.y;
          const endX = child.x;
          const endY = child.y;
          const controlOffset = Math.abs(endX - startX) * 0.5;
          const path = new Konva.Path({
            data: `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`,
            stroke: "#808080",
            strokeWidth: 1,
            fill: "transparent",
          });
          layer.add(path);
        });
      });

      // Draw nodes
      nodes.forEach((node, index) => {
        const isRoot = index === 0;
        const isEmpty = node.text === "";
        const isActive = selectionState.activeNodeId === node.id;
        const displayText = isEmpty ? "empty" : node.text;
        const textWidth = textWidths.get(node.id) || 100;
        const padding = 20;
        const rectWidth = Math.max(textWidth + padding * 2, isRoot ? 100 : 80);
        const rectHeight = 32;

        const group = new Konva.Group();

        const rect = new Konva.Rect({
          x: node.x,
          y: node.y - rectHeight / 2,
          width: rectWidth,
          height: rectHeight,
          cornerRadius: 4,
          fill: isActive
            ? isRoot
              ? "#333333"
              : "#f0f0f0"
            : isRoot
              ? "#000000"
              : isEmpty
                ? "#fafafa"
                : "#ffffff",
          stroke: isActive ? "#000000" : isRoot ? "#000000" : "#808080",
          strokeWidth: isActive ? 2 : 1,
        });
        group.add(rect);

        const text = new Konva.Text({
          x: node.x + padding,
          y: node.y - 7,
          text: displayText,
          fontSize: 14,
          fontFamily: "sans-serif",
          fill: isRoot ? "#ffffff" : isEmpty ? "#808080" : "#000000",
          fontStyle: isEmpty ? "italic" : "normal",
          listening: false,
        });
        group.add(text);

        group.on("click tap", () => {
          const textarea = textareaRef.current;
          if (!textarea) return;
          // lineNumber 0 = title (not in textarea), 1+ = textarea lines
          if (node.lineNumber === 0) return;
          textarea.focus();
          const textareaLineIndex = node.lineNumber - 1;
          const lines = textarea.value.split("\n");
          let pos = 0;
          for (let i = 0; i < textareaLineIndex && i < lines.length; i++) {
            pos += lines[i].length + 1;
          }
          textarea.setSelectionRange(pos, pos);
          updateSelection();
        });

        layer.add(group);
      });

      layer.draw();

      // Zoom
      stage.on("wheel", (e: any) => {
        e.evt.preventDefault();
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const mousePointTo = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale,
        };
        const scaleBy = 1.05;
        const newScale =
          e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        const limitedScale = Math.max(0.2, Math.min(3, newScale));
        stage.scale({ x: limitedScale, y: limitedScale });
        stage.position({
          x: pointer.x - mousePointTo.x * limitedScale,
          y: pointer.y - mousePointTo.y * limitedScale,
        });
        layer.draw();
      });

      const resizeObserver = new ResizeObserver(() => {
        stage.width(container.clientWidth);
        stage.height(container.clientHeight);
        layer.draw();
      });
      resizeObserver.observe(container);

      return () => resizeObserver.disconnect();
    });
  }, [nodes, selectionState.activeNodeId]);

  // Selection sync: textarea line → mindmap line (offset +1 for title)
  const updateSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = textarea.value.substring(0, cursorPos);
    const textareaLine = beforeCursor.split("\n").length - 1;
    const mindmapLine = textareaLine + 1; // +1 because title is line 0
    const activeNode =
      nodes.find((n) => n.lineNumber === mindmapLine) || null;
    setSelectionState({
      cursorPos,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      activeNodeId: activeNode?.id || null,
    });
  }, [nodes]);

  useEffect(() => {
    const handleSelectionChange = () => updateSelection();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [updateSelection]);

  // Keyboard handling
  const handleKeyDown = (e: any) => {
    const textarea = e.currentTarget as HTMLTextAreaElement;
    const { selectionStart, selectionEnd } = textarea;

    if (e.key === "Enter" && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      const lines = text.split("\n");
      let pos = 0;
      let currentLineIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (pos + lines[i].length >= selectionStart) {
          currentLineIndex = i;
          break;
        }
        pos += lines[i].length + 1;
      }
      const currentLine = lines[currentLineIndex];
      const indent = currentLine.match(/^(\s*)/)?.[1] || "";
      const insertion = "\n" + indent;
      const newValue =
        text.substring(0, selectionStart) +
        insertion +
        text.substring(selectionEnd);
      setText(newValue);
      setTimeout(() => {
        textarea.setSelectionRange(
          selectionStart + insertion.length,
          selectionStart + insertion.length
        );
      }, 0);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const lines = text.split("\n");
      let pos = 0;
      let lineIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (pos + lines[i].length >= selectionStart) {
          lineIndex = i;
          break;
        }
        pos += lines[i].length + 1;
      }

      if (e.shiftKey) {
        if (lines[lineIndex].startsWith("  ")) {
          lines[lineIndex] = lines[lineIndex].substring(2);
          const newText = lines.join("\n");
          setText(newText);
          setTimeout(() => {
            const newPos = Math.max(0, selectionStart - 2);
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
        }
      } else {
        lines[lineIndex] = "  " + lines[lineIndex];
        const newText = lines.join("\n");
        setText(newText);
        setTimeout(() => {
          textarea.setSelectionRange(selectionStart + 2, selectionStart + 2);
        }, 0);
      }
      return;
    }
  };

  return (
    <div class="flex flex-col md:flex-row h-full">
      {/* Mobile tab switcher */}
      <div class="flex md:hidden border-b bg-gray-50">
        <button
          type="button"
          class={`flex-1 py-2 text-sm font-medium transition ${mobileTab === "text" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
          onClick={() => setMobileTab("text")}
        >
          テキスト
        </button>
        <button
          type="button"
          class={`flex-1 py-2 text-sm font-medium transition ${mobileTab === "map" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
          onClick={() => setMobileTab("map")}
        >
          マップ
        </button>
      </div>
      <div class={`w-full md:w-1/3 border-r flex flex-col min-h-0 ${mobileTab === "text" ? "flex-1 md:flex-none" : "hidden md:flex"}`}>
        <div class="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
          <input
            type="text"
            value={title}
            onInput={(e: any) => setTitle(e.currentTarget.value)}
            onBlur={() => noteId && saveNote(text)}
            class="flex-1 min-w-0 text-sm px-2 py-1 border rounded font-semibold"
            placeholder="タイトル（ルートノード）"
          />
          {noteId && (
            <>
              <label class="flex items-center gap-1 text-xs whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e: any) => {
                    const newVal = e.currentTarget.checked;
                    setIsPublic(newVal);
                    saveNote(text, undefined, newVal);
                  }}
                />
                公開
              </label>
              <span class="text-xs text-gray-400 whitespace-nowrap">
                {saveStatus}
              </span>
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onInput={(e: any) => setText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onMouseUp={updateSelection}
          class="flex-1 p-4 font-mono text-sm resize-none outline-none bg-white"
          placeholder="インデントで階層を作成..."
          spellcheck={false}
        />
      </div>
      <div ref={canvasRef} class={`flex-1 bg-white overflow-hidden min-h-0 ${mobileTab === "map" ? "" : "hidden md:block"}`} />
    </div>
  );
}
