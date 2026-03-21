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
  let mindmapPos = titleStr.length + 1;
  for (let i = 0; i < lineIdx; i++) {
    const isBlank = lines[i].trim() === "";
    mindmapPos += (isBlank ? 0 : 2) + lines[i].length + 1;
  }
  const currentLine = lines[lineIdx];
  if (currentLine !== undefined && currentLine.trim() !== "") {
    mindmapPos += 2 + remaining;
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

// Helper: find line info at a given position
function getLineInfo(text: string, pos: number) {
  const lines = text.split("\n");
  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (currentPos + lines[i].length >= pos) {
      return { lineIndex: i, lineStart: currentPos, line: lines[i], posInLine: pos - currentPos, lines };
    }
    currentPos += lines[i].length + 1;
  }
  const lastIdx = lines.length - 1;
  const lastStart = text.length - lines[lastIdx].length;
  return { lineIndex: lastIdx, lineStart: lastStart, line: lines[lastIdx], posInLine: pos - lastStart, lines };
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
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const konvaStageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const konvaRef = useRef<any>(null);
  const saveTimerRef = useRef<any>(null);
  const saveStatusRef = useRef<HTMLSpanElement>(null);
  const dragStateRef = useRef<{ anchorPos: number } | null>(null);
  const cursorOffsetsRef = useRef<Map<string, number[]>>(new Map());
  const nodesRef = useRef<MindMapNode[]>([]);
  const updateSelectionRef = useRef<() => void>(() => {});

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
    nodesRef.current = parsed;
  }, [text, title]);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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

      // Drag selection on stage
      stage.on("mousemove touchmove", () => {
        const drag = dragStateRef.current;
        if (!drag) return;
        const textarea = textareaRef.current;
        if (!textarea) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const scale = stage.scaleX();
        const worldX = (pointer.x - stage.x()) / scale;
        const worldY = (pointer.y - stage.y()) / scale;

        // Find closest node by Y coordinate
        const currentNodes = nodesRef.current;
        let closestNode: MindMapNode | null = null;
        let closestDist = Infinity;
        for (const n of currentNodes) {
          if (n.lineNumber === 0) continue;
          const dist = Math.abs(n.y - worldY);
          if (dist < closestDist) {
            closestDist = dist;
            closestNode = n;
          }
        }
        if (!closestNode) return;

        const offsets = cursorOffsetsRef.current.get(closestNode.id);
        let charIdx = closestNode.text.length;
        if (offsets) {
          const relX = worldX - closestNode.x - 20; // 20 = nodePadding
          let bestIdx = 0;
          let bestDist2 = Math.abs(relX);
          for (let i = 1; i < offsets.length; i++) {
            const d = Math.abs(relX - offsets[i]);
            if (d < bestDist2) { bestDist2 = d; bestIdx = i; }
          }
          charIdx = bestIdx;
        }

        const textareaLineIndex = closestNode.lineNumber - 1;
        const lines = textarea.value.split("\n");
        let lineStart = 0;
        for (let i = 0; i < textareaLineIndex && i < lines.length; i++) {
          lineStart += lines[i].length + 1;
        }
        const line = lines[textareaLineIndex] || "";
        const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0;
        const currentPos = lineStart + leadingSpaces + charIdx;

        const start = Math.min(drag.anchorPos, currentPos);
        const end = Math.max(drag.anchorPos, currentPos);
        textarea.setSelectionRange(start, end);
        updateSelectionRef.current();
      });

      stage.on("mouseup touchend", () => {
        if (dragStateRef.current) {
          dragStateRef.current = null;
          stage.draggable(true);
        }
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

  // Auto-scroll to active node
  useEffect(() => {
    const stage = konvaStageRef.current;
    if (!stage || !selectionState.activeNodeId) return;

    const activeNode = nodes.find((n) => n.id === selectionState.activeNodeId);
    if (!activeNode) return;

    const scale = stage.scaleX();
    const stageWidth = stage.width();
    const stageHeight = stage.height();
    const nodeWidth = 200;
    const nodeHeight = 32;
    const padding = 50;

    const nodeScreenX = activeNode.x * scale + stage.x();
    const nodeScreenY = (activeNode.y - nodeHeight / 2) * scale + stage.y();
    const nodeScreenWidth = nodeWidth * scale;
    const nodeScreenHeight = nodeHeight * scale;

    const isVisible =
      nodeScreenX >= padding &&
      nodeScreenX + nodeScreenWidth <= stageWidth - padding &&
      nodeScreenY >= padding &&
      nodeScreenY + nodeScreenHeight <= stageHeight - padding;

    if (!isVisible) {
      let targetX = stage.x();
      let targetY = stage.y();

      if (nodeScreenX < padding) {
        targetX = padding - activeNode.x * scale;
      } else if (nodeScreenX + nodeScreenWidth > stageWidth - padding) {
        targetX = stageWidth - padding - (activeNode.x + nodeWidth) * scale;
      }

      if (nodeScreenY < padding) {
        targetY = padding - (activeNode.y - nodeHeight / 2) * scale;
      } else if (nodeScreenY + nodeScreenHeight > stageHeight - padding) {
        targetY = stageHeight - padding - (activeNode.y + nodeHeight / 2) * scale;
      }

      stage.x(targetX);
      stage.y(targetY);
      layerRef.current?.draw();
    }
  }, [selectionState.activeNodeId, nodes]);

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
    // Keep ref in sync for drag handler
    cursorOffsetsRef.current = cursorOffsets;

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
    const nodePadding = 20;
    nodes.forEach((node, index) => {
      const isRoot = index === 0;
      const isEmpty = node.text === "";
      const isActive = selectionState.activeNodeId === node.id;
      const displayText = isEmpty ? "empty" : node.text;
      const textWidth = textWidths.get(node.id) || 100;
      const rectWidth = Math.max(textWidth + nodePadding * 2, isRoot ? 100 : 80);
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

      // Selection highlight
      const selection = getSelectionInNode(node, selectionState);
      if (selection && node.text.length > 0) {
        const offsets = cursorOffsets.get(node.id);
        if (offsets) {
          const selStartX = offsets[selection.start] || 0;
          const selEndX = offsets[selection.end] || 0;
          const highlight = new Konva.Rect({
            x: node.x + nodePadding + selStartX,
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
        x: node.x + nodePadding,
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
      if (cursorPos !== null) {
        const offsets = cursorOffsets.get(node.id);
        const cursorX = node.x + nodePadding + (offsets?.[cursorPos] || 0);
        const cursorLine = new Konva.Line({
          points: [cursorX, node.y - 10, cursorX, node.y + 10],
          stroke: isRoot ? "#ffffff" : "#000000",
          strokeWidth: 2,
          listening: false,
        });
        group.add(cursorLine);
      }

      // Mousedown → jump to clicked character position in textarea
      group.on("mousedown touchstart", (e: any) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        if (node.lineNumber === 0) return;

        const textareaLineIndex = node.lineNumber - 1;
        const lines = textarea.value.split("\n");
        let lineStartPos = 0;
        for (let i = 0; i < textareaLineIndex && i < lines.length; i++) {
          lineStartPos += lines[i].length + 1;
        }
        const line = lines[textareaLineIndex] || "";
        const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0;

        // Calculate which character was clicked
        let charIndex = node.text.length; // default: end of text
        const offsets = cursorOffsets.get(node.id);
        if (offsets && e.target) {
          const stage = konvaStageRef.current;
          if (stage) {
            const pointer = stage.getPointerPosition();
            if (pointer) {
              const scale = stage.scaleX();
              const clickX = (pointer.x - stage.x()) / scale - node.x - nodePadding;
              // Find closest character boundary
              let bestIdx = 0;
              let bestDist = Math.abs(clickX);
              for (let i = 1; i < offsets.length; i++) {
                const dist = Math.abs(clickX - offsets[i]);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestIdx = i;
                }
              }
              charIndex = bestIdx;
            }
          }
        }

        const targetPos = lineStartPos + leadingSpaces + charIndex;
        // Start drag selection
        dragStateRef.current = { anchorPos: targetPos };
        const stage = konvaStageRef.current;
        if (stage) stage.draggable(false);

        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(targetPos, targetPos);
          updateSelection();
        }, 0);
      });

      // Double-click → select node text in textarea
      group.on("dblclick dbltap", () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        if (node.lineNumber === 0) return;
        textarea.focus();
        const textareaLineIndex = node.lineNumber - 1;
        const lines = textarea.value.split("\n");
        let lineStart = 0;
        for (let i = 0; i < textareaLineIndex && i < lines.length; i++) {
          lineStart += lines[i].length + 1;
        }
        const line = lines[textareaLineIndex] || "";
        const leadingSpaces = line.length - line.trimStart().length;
        textarea.setSelectionRange(lineStart + leadingSpaces, lineStart + line.length);
        updateSelection();
      });

      layer.add(group);
    });

    layer.draw();
  }, [nodes, selectionState]);

  // Selection sync
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
  updateSelectionRef.current = updateSelection;

  useEffect(() => {
    const handleSelectionChange = () => updateSelection();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [updateSelection]);

  // Click handler: skip leading spaces
  const handleClick = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    if (selectionStart !== selectionEnd) return;

    const { lineStart, line } = getLineInfo(text, selectionStart);
    const posInLine = selectionStart - lineStart;
    const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0;

    if (leadingSpaces > 0 && posInLine > 0 && posInLine <= leadingSpaces) {
      const newPos = lineStart + leadingSpaces;
      setTimeout(() => textarea.setSelectionRange(newPos, newPos), 0);
    }
  }, [text]);

  // Keyboard handling
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const { selectionStart, selectionEnd } = textarea;

    // Enter: auto-indent (skip during IME)
    if (e.key === "Enter" && !isComposing && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const { line, lineStart } = getLineInfo(text, selectionStart);
      const indent = line.match(/^(\s*)/)?.[1] || "";
      const posInLine = selectionStart - lineStart;
      const isAtEnd = posInLine >= line.length;

      if (isAtEnd) {
        const insertion = "\n" + indent;
        const newValue = text.substring(0, selectionStart) + insertion + text.substring(selectionEnd);
        setText(newValue);
        setTimeout(() => {
          textarea.setSelectionRange(selectionStart + insertion.length, selectionStart + insertion.length);
        }, 0);
      } else {
        // Mid-line: trim leading spaces from text flowing to next line
        const textAfter = line.substring(posInLine).trimStart();
        const newValue = text.substring(0, selectionStart) + "\n" + indent + textAfter + text.substring(lineStart + line.length);
        setText(newValue);
        setTimeout(() => {
          const newPos = selectionStart + 1 + indent.length;
          textarea.setSelectionRange(newPos, newPos);
        }, 0);
      }
      return;
    }

    // Backspace: smart indent handling
    if (e.key === "Backspace" && selectionStart === selectionEnd) {
      const { lineIndex, lineStart, line, posInLine, lines } = getLineInfo(text, selectionStart);
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || "";

      // At line start: merge with previous line, stripping indent
      if (posInLine === 0 && lineIndex > 0) {
        const trimmed = line.trimStart();
        if (trimmed.length > 0 && line !== trimmed) {
          e.preventDefault();
          const prevLineEnd = lineStart - 1;
          const newValue = text.substring(0, prevLineEnd) + trimmed + text.substring(lineStart + line.length);
          setText(newValue);
          setTimeout(() => textarea.setSelectionRange(prevLineEnd, prevLineEnd), 0);
          return;
        }
      }

      // At first non-space char: merge with previous line
      if (posInLine > 0 && posInLine === leadingSpaces.length && leadingSpaces.length > 0 && lineIndex > 0) {
        e.preventDefault();
        const prevLineEnd = lineStart - 1;
        const trimmed = line.trimStart();
        const newValue = text.substring(0, prevLineEnd) + trimmed + text.substring(lineStart + line.length);
        setText(newValue);
        setTimeout(() => textarea.setSelectionRange(prevLineEnd, prevLineEnd), 0);
        return;
      }

      // Whitespace-only line: delete entire line
      if (line.trim() === "" && line.length > 0 && posInLine === line.length) {
        e.preventDefault();
        if (lineIndex > 0) {
          const prevLineEnd = lineStart - 1;
          const newValue = text.substring(0, lineStart - 1) + text.substring(lineStart + line.length);
          setText(newValue);
          setTimeout(() => textarea.setSelectionRange(prevLineEnd, prevLineEnd), 0);
        } else if (lineIndex < lines.length - 1) {
          const newValue = text.substring(lineStart + line.length + 1);
          setText(newValue);
          setTimeout(() => textarea.setSelectionRange(0, 0), 0);
        } else {
          setText("");
        }
        return;
      }

      // Would result in whitespace-only line: delete entire line
      if (posInLine > 0) {
        const simulated = text.substring(0, selectionStart - 1) + text.substring(selectionStart);
        const simLines = simulated.split("\n");
        const simLine = simLines[lineIndex];
        if (simLine && simLine.trim() === "" && simLine.length > 0) {
          e.preventDefault();
          if (lineIndex > 0) {
            const prevLineEnd = lineStart - 1;
            const newValue = text.substring(0, lineStart - 1) + text.substring(lineStart + line.length);
            setText(newValue);
            setTimeout(() => textarea.setSelectionRange(prevLineEnd, prevLineEnd), 0);
          } else if (lineIndex < lines.length - 1) {
            const newValue = text.substring(lineStart + line.length + 1);
            setText(newValue);
            setTimeout(() => textarea.setSelectionRange(0, 0), 0);
          } else {
            setText("");
          }
          return;
        }
      }
    }

    // Arrow keys with indent skip
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
      // Let default handle Shift+Up/Down (selection)
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;
      // Let default handle extending selection with Shift+Left/Right
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && selectionStart !== selectionEnd) return;

      const lines = text.split("\n");
      const refPos = (e.key === "ArrowRight" || e.key === "ArrowDown") ? selectionEnd : selectionStart;
      let currentPos = 0;
      let lineIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (currentPos + lines[i].length >= refPos) {
          lineIndex = i;
          break;
        }
        currentPos += lines[i].length + 1;
      }
      const currentLine = lines[lineIndex];
      const leadingSpaces = currentLine.match(/^(\s*)/)?.[1]?.length || 0;
      const posInLine = refPos - currentPos;

      if (e.key === "ArrowLeft") {
        if (e.metaKey || e.ctrlKey) {
          // Cmd+Left at indent area → jump to prev line end
          if (posInLine <= leadingSpaces && lineIndex > 0) {
            e.preventDefault();
            const prevLineEnd = currentPos - 1;
            textarea.setSelectionRange(prevLineEnd, prevLineEnd);
            return;
          }
        } else {
          // At first non-space char → jump to prev line end
          if (leadingSpaces > 0 && posInLine === leadingSpaces && selectionStart === selectionEnd && lineIndex > 0) {
            e.preventDefault();
            textarea.setSelectionRange(currentPos - 1, currentPos - 1);
            return;
          }
        }
      } else if (e.key === "ArrowRight") {
        if (e.metaKey || e.ctrlKey) {
          // Cmd+Right at line end → skip indent of next line
          if (posInLine >= currentLine.length && lineIndex < lines.length - 1) {
            e.preventDefault();
            const nextLine = lines[lineIndex + 1];
            const nextSpaces = nextLine.match(/^(\s*)/)?.[1]?.length || 0;
            const targetPos = currentPos + currentLine.length + 1 + nextSpaces;
            textarea.setSelectionRange(targetPos, targetPos);
            return;
          }
        } else {
          // At line end → skip indent of next line
          if (posInLine === currentLine.length && lineIndex < lines.length - 1 && selectionStart === selectionEnd) {
            const nextLine = lines[lineIndex + 1];
            const nextSpaces = nextLine.match(/^(\s*)/)?.[1]?.length || 0;
            if (nextSpaces > 0) {
              e.preventDefault();
              const targetPos = currentPos + currentLine.length + 1 + nextSpaces;
              textarea.setSelectionRange(targetPos, targetPos);
              return;
            }
          }
        }
      } else if (e.key === "ArrowUp") {
        if (lineIndex > 0) {
          e.preventDefault();
          const prevLine = lines[lineIndex - 1];
          const prevSpaces = prevLine.match(/^(\s*)/)?.[1]?.length || 0;
          let prevLineStart = 0;
          for (let i = 0; i < lineIndex - 1; i++) prevLineStart += lines[i].length + 1;
          textarea.setSelectionRange(prevLineStart + prevSpaces, prevLineStart + prevSpaces);
          return;
        }
      } else if (e.key === "ArrowDown") {
        if (lineIndex < lines.length - 1) {
          e.preventDefault();
          const nextLine = lines[lineIndex + 1];
          const nextSpaces = nextLine.match(/^(\s*)/)?.[1]?.length || 0;
          let nextLineStart = 0;
          for (let i = 0; i <= lineIndex; i++) nextLineStart += lines[i].length + 1;
          textarea.setSelectionRange(nextLineStart + nextSpaces, nextLineStart + nextSpaces);
          return;
        }
      }
    }

    // Tab: indent/dedent
    if (e.key === "Tab") {
      e.preventDefault();
      const { lineIndex, lines } = getLineInfo(text, selectionStart);

      if (e.shiftKey) {
        if (lines[lineIndex].startsWith("  ")) {
          lines[lineIndex] = lines[lineIndex].substring(2);
          setText(lines.join("\n"));
          setTimeout(() => {
            const newPos = Math.max(0, selectionStart - 2);
            textarea.setSelectionRange(newPos, newPos);
          }, 0);
        }
      } else {
        lines[lineIndex] = "  " + lines[lineIndex];
        setText(lines.join("\n"));
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
          onClick={handleClick}
          onMouseUp={updateSelection}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          className="flex-1 p-4 font-mono text-sm resize-none outline-none bg-white"
          placeholder="インデントで階層を作成..."
          spellCheck={false}
        />
      </div>
      <div ref={canvasRef} className="flex-1 bg-white overflow-hidden" />
    </div>
  );
}
