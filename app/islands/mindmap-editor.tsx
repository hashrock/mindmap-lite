import { useState, useEffect, useRef, useCallback } from "hono/jsx";
import { parseTextToNodes, findNodeAtPosition } from "../utils/mindmapParser";
import type { MindMapNode, SelectionState } from "../types/MindMap";

const DEMO_TEXT = `Mindmap Lite
  使い方
    インデントで階層を作る
    Tabでインデント追加
    Shift+Tabでインデント削除
  特徴
    リアルタイムプレビュー
    テキストベース
    シンプル`;

export default function MindmapEditor() {
  const [text, setText] = useState(DEMO_TEXT);
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

  // Parse text to nodes
  useEffect(() => {
    const parsed = parseTextToNodes(text);
    setNodes(parsed);
  }, [text]);

  // Render mindmap with vanilla Konva
  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    // Dynamic import Konva to avoid SSR issues
    import("konva").then((KonvaModule) => {
      const Konva = KonvaModule.default;
      const container = canvasRef.current!;

      // Destroy previous stage
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

      // Create node map
      const nodeMap: Record<string, MindMapNode> = {};
      nodes.forEach((n) => (nodeMap[n.id] = n));

      // Measure text widths
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

      // Draw connections (bezier curves)
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

        // Background rect
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

        // Text
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

        // Click handler
        group.on("click tap", () => {
          const textarea = textareaRef.current;
          if (textarea) {
            textarea.focus();
            const pos = node.startPos;
            textarea.setSelectionRange(pos, pos);
            updateSelection();
          }
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
        const newPos = {
          x: pointer.x - mousePointTo.x * limitedScale,
          y: pointer.y - mousePointTo.y * limitedScale,
        };
        stage.position(newPos);
        layer.draw();
      });

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        stage.width(container.clientWidth);
        stage.height(container.clientHeight);
        layer.draw();
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
      };
    });
  }, [nodes, selectionState.activeNodeId]);

  // Selection sync
  const updateSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const activeNode = findNodeAtPosition(nodes, cursorPos);

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

    // Enter: auto-indent
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

    // Tab: indent/outdent
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
        // Outdent
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
        // Indent
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
    <div class="flex h-full">
      <div class="w-1/3 border-r flex flex-col">
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
      <div ref={canvasRef} class="flex-1 bg-white overflow-hidden" />
    </div>
  );
}
