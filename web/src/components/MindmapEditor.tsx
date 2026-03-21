import { useState, useEffect, useRef, useCallback } from "react";
import { parseTextToNodes } from "../lib/mindmapParser";
import type { MindMapNode, SelectionState } from "../types/MindMap";

const DEMO_TEXT = `使い方
  インデントで階層を作る
  Tabでインデント追加
  Shift+Tabでインデント削除
特徴
  リアルタイムプレビュー
  テキストベース
  シンプル`;

function buildMindmapText(rootTitle: string, content: string): string {
  const lines = content.split("\n");
  const indented = lines.map((line) => (line.trim() === "" ? "" : "  " + line));
  return rootTitle + "\n" + indented.join("\n");
}

// Convert textarea position to mindmap text position
function textareaPosToMindmapPos(pos: number, titleStr: string, content: string): number {
  const lines = content.split("\n");
  let remaining = pos;
  let lineIdx = 0;
  while (lineIdx < lines.length && remaining > lines[lineIdx].length) {
    remaining -= lines[lineIdx].length + 1;
    lineIdx++;
  }
  // Map to mindmap text coordinates
  let mindmapPos = titleStr.length + 1; // title + \n
  for (let i = 0; i < lineIdx; i++) {
    const isBlank = lines[i].trim() === "";
    mindmapPos += (isBlank ? 0 : 2) + lines[i].length + 1;
  }
  const currentLine = lines[lineIdx];
  if (currentLine !== undefined && currentLine.trim() !== "") {
    mindmapPos += 2 + remaining; // 2 for "  " indent prefix
  } else {
    mindmapPos += remaining;
  }
  return mindmapPos;
}

// Get cursor position relative to node text
function getCursorPositionInNode(
  node: MindMapNode,
  selState: SelectionState
): number | null {
  if (selState.activeNodeId !== node.id) return null;
  const lineStart = node.lineStartPos ?? node.startPos;
  const lineEnd = node.lineEndPos ?? node.endPos;
  if (selState.cursorPos >= lineStart && selState.cursorPos <= lineEnd) {
    const relativePos = selState.cursorPos - node.startPos;
    return Math.min(Math.max(0, relativePos), node.text.length);
  }
  return null;
}

// Get selection range relative to node text
function getSelectionInNode(
  node: MindMapNode,
  selState: SelectionState
): { start: number; end: number } | null {
  const { selectionStart, selectionEnd } = selState;
  if (selectionStart === selectionEnd) return null;
  if (selectionEnd >= node.startPos && selectionStart <= node.endPos) {
    const start = Math.max(0, selectionStart - node.startPos);
    const end = Math.min(node.text.length, selectionEnd - node.startPos);
    if (start < end) return { start, end };
  }
  return null;
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
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [selectionState, setSelectionState] = useState<SelectionState>({
    cursorPos: 0,
    selectionStart: 0,
    selectionEnd: 0,
    activeNodeId: null,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const konvaStageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const konvaRef = useRef<any>(null);
  const saveTimerRef = useRef<any>(null);
  const saveStatusRef = useRef<HTMLSpanElement>(null);

  const updateSaveStatus = useCallback((status: string) => {
    if (saveStatusRef.current) {
      saveStatusRef.current.textContent = status;
    }
  }, []);

  // Auto-save
  const saveNote = useCallback(
    async (content: string, noteTitle?: string, pub?: boolean) => {
      if (!noteId) return;
      updateSaveStatus("保存中...");
      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            title: noteTitle ?? title,
            isPublic: pub ?? isPublic,
          }),
        });
        updateSaveStatus(res.ok ? "保存済み" : "保存失敗");
      } catch {
        updateSaveStatus("保存失敗");
      }
    },
    [noteId, title, isPublic, updateSaveStatus]
  );

  // Debounced auto-save
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

  // Parse text to nodes
  useEffect(() => {
    const rootTitle = title || "Mindmap";
    const mindmapText = buildMindmapText(rootTitle, text);
    const parsed = parseTextToNodes(mindmapText);
    setNodes(parsed);
  }, [text, title]);

  // Load Konva and create stage once
  useEffect(() => {
    if (!canvasRef.current) return;
    const container = canvasRef.current;

    import("konva").then((mod) => {
      const Konva = mod.default;
      konvaRef.current = Konva;

      const stage = new Konva.Stage({
        container,
        width: container.clientWidth,
        height: container.clientHeight,
        draggable: true,
      });
      konvaStageRef.current = stage;

      const layer = new Konva.Layer();
      stage.add(layer);
      layerRef.current = layer;

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

      // Trigger initial draw
      setNodes((prev) => [...prev]);
    });

    return () => {
      if (konvaStageRef.current) {
        konvaStageRef.current.destroy();
        konvaStageRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  // Redraw layer when nodes or selection change
  useEffect(() => {
    const Konva = konvaRef.current;
    const layer = layerRef.current;
    if (!Konva || !layer || nodes.length === 0) return;

    layer.destroyChildren();

    const nodeMap: Record<string, MindMapNode> = {};
    nodes.forEach((n) => (nodeMap[n.id] = n));

    // Pre-calculate text widths and character offsets
    const textWidths = new Map<string, number>();
    const cursorOffsets = new Map<string, number[]>();
    nodes.forEach((node) => {
      const displayText = node.text === "" ? "empty" : node.text;
      const t = new Konva.Text({
        text: displayText,
        fontSize: 14,
        fontFamily: "sans-serif",
        fontStyle: node.text === "" ? "italic" : "normal",
      });
      textWidths.set(node.id, t.width());

      // Calculate character offsets for cursor/selection positioning
      if (node.text.length > 0) {
        const offsets: number[] = [0];
        for (let i = 0; i < node.text.length; i++) {
          const partial = new Konva.Text({
            text: node.text.substring(0, i + 1),
            fontSize: 14,
            fontFamily: "sans-serif",
          });
          offsets.push(partial.width());
        }
        cursorOffsets.set(node.id, offsets);
      }
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
    const padding = 20;
    nodes.forEach((node, index) => {
      const isRoot = index === 0;
      const isEmpty = node.text === "";
      const isActive = selectionState.activeNodeId === node.id;
      const displayText = isEmpty ? "empty" : node.text;
      const textWidth = textWidths.get(node.id) || 100;
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
          ? isRoot ? "#333333" : "#f0f0f0"
          : isRoot ? "#000000" : isEmpty ? "#fafafa" : "#ffffff",
        stroke: isActive ? "#000000" : isRoot ? "#000000" : "#808080",
        strokeWidth: isActive ? 2 : 1,
      });
      group.add(rect);

      // Selection highlight (after background, before text)
      const selection = getSelectionInNode(node, selectionState);
      if (selection && node.text.length > 0) {
        const offsets = cursorOffsets.get(node.id);
        if (offsets) {
          const selStartX = offsets[selection.start] || 0;
          const selEndX = offsets[selection.end] || 0;
          const highlight = new Konva.Rect({
            x: node.x + padding + selStartX,
            y: node.y - 10,
            width: selEndX - selStartX,
            height: 20,
            fill: isRoot ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 100, 255, 0.2)",
            listening: false,
          });
          group.add(highlight);
        }
      }

      const textNode = new Konva.Text({
        x: node.x + padding,
        y: node.y - 7,
        text: displayText,
        fontSize: 14,
        fontFamily: "sans-serif",
        fill: isRoot ? "#ffffff" : isEmpty ? "#808080" : "#000000",
        fontStyle: isEmpty ? "italic" : "normal",
        listening: false,
      });
      group.add(textNode);

      // Cursor line
      const cursorPos = getCursorPositionInNode(node, selectionState);
      if (cursorPos !== null && node.text.length > 0) {
        const offsets = cursorOffsets.get(node.id);
        if (offsets) {
          const cursorX = node.x + padding + (offsets[cursorPos] || 0);
          const cursorLine = new Konva.Line({
            points: [cursorX, node.y - 10, cursorX, node.y + 10],
            stroke: isRoot ? "#ffffff" : "#000000",
            strokeWidth: 2,
            listening: false,
          });
          group.add(cursorLine);
        }
      }

      // Click → jump to textarea
      group.on("click tap", () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
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

      // Double-click → select node text in textarea
      group.on("dblclick dbltap", () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        if (node.lineNumber === 0) return;
        textarea.focus();
        // Select the trimmed text range (skip leading indent)
        const textareaLineIndex = node.lineNumber - 1;
        const lines = textarea.value.split("\n");
        let lineStart = 0;
        for (let i = 0; i < textareaLineIndex && i < lines.length; i++) {
          lineStart += lines[i].length + 1;
        }
        const line = lines[textareaLineIndex] || "";
        const leadingSpaces = line.length - line.trimStart().length;
        const selStart = lineStart + leadingSpaces;
        const selEnd = lineStart + line.length;
        textarea.setSelectionRange(selStart, selEnd);
        updateSelection();
      });

      layer.add(group);
    });

    layer.draw();
  }, [nodes, selectionState]);

  // Selection sync (convert textarea positions to mindmap text positions)
  const updateSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const tPos = textarea.selectionStart;
    const beforeCursor = textarea.value.substring(0, tPos);
    const textareaLine = beforeCursor.split("\n").length - 1;
    const mindmapLine = textareaLine + 1;
    const activeNode =
      nodes.find((n) => n.lineNumber === mindmapLine) || null;
    const titleStr = title || "Mindmap";
    setSelectionState({
      cursorPos: textareaPosToMindmapPos(tPos, titleStr, text),
      selectionStart: textareaPosToMindmapPos(textarea.selectionStart, titleStr, text),
      selectionEnd: textareaPosToMindmapPos(textarea.selectionEnd, titleStr, text),
      activeNodeId: activeNode?.id || null,
    });
  }, [nodes, title, text]);

  useEffect(() => {
    const handleSelectionChange = () => updateSelection();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [updateSelection]);

  // Keyboard handling
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const { selectionStart, selectionEnd } = textarea;

    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
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
    <div className="flex h-full">
      <div className="w-1/3 border-r flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => noteId && saveNote(text)}
            className="flex-1 min-w-0 text-sm px-2 py-1 border rounded font-semibold"
            placeholder="タイトル（ルートノード）"
          />
          {noteId && (
            <>
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => {
                    const newVal = e.target.checked;
                    setIsPublic(newVal);
                    saveNote(text, undefined, newVal);
                  }}
                />
                公開
              </label>
              <span ref={saveStatusRef} className="text-xs text-gray-400 whitespace-nowrap" />
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onMouseUp={updateSelection}
          className="flex-1 p-4 font-mono text-sm resize-none outline-none bg-white"
          placeholder="インデントで階層を作成..."
          spellCheck={false}
        />
      </div>
      <div ref={canvasRef} className="flex-1 bg-white overflow-hidden" />
    </div>
  );
}
