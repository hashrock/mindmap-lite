import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { MindMapNode } from "../types/MindMap";
import type { MindMapModel } from "../domain/model";
import { findNode, updateNodeText } from "../domain/model";
import { layoutMindMap } from "../lib/treeLayout";
import { flattenToNodes } from "../application/nodeUtils";
import { parseContent, serializeModel } from "../application/persistence";
import {
  handleEnter,
  handleTab,
  handleBackspaceAtStart,
  handleDeleteAtEnd,
  handleArrowUp,
  handleArrowDown,
  handleCmdLeft,
  handleCmdRight,
  handleCmdShiftLeft,
  handleCmdShiftRight,
  handleArrowLeftEdge,
  handleArrowRightEdge,
  type EditorState,
  type StateUpdate,
} from "../application/editorActions";

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
  // Model state
  const [model, setModel] = useState<MindMapModel>(() =>
    parseContent(initialContent, initialTitle)
  );
  const [isPublic, setIsPublic] = useState(initialIsPublic || false);

  // Editing state
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [konvaReady, setKonvaReady] = useState(false);
  const [inputPos, setInputPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const konvaStageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const cursorLayerRef = useRef<any>(null);
  const konvaRef = useRef<any>(null);
  const saveTimerRef = useRef<any>(null);
  const saveStatusRef = useRef<HTMLSpanElement>(null);
  const cursorOffsetsRef = useRef<Map<string, number[]>>(new Map());
  const dragStateRef = useRef<{
    nodeId: string;
    anchorCharIdx: number;
  } | null>(null);
  const wasDraggingRef = useRef(false);
  const modelRef = useRef(model);
  modelRef.current = model;

  // Derived: flat nodes with layout
  const nodes = useMemo(() => {
    const flat = flattenToNodes(model);
    if (flat.length > 0) layoutMindMap(flat);
    return flat;
  }, [model]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Title = root node text
  const title = model.text;

  // --- Save ---
  const updateSaveStatus = useCallback((status: string) => {
    if (saveStatusRef.current) saveStatusRef.current.textContent = status;
  }, []);

  const saveNote = useCallback(
    async (currentModel: MindMapModel, pub?: boolean) => {
      if (!noteId) return;
      updateSaveStatus("保存中...");
      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: serializeModel(currentModel),
            title: currentModel.text,
            isPublic: pub ?? isPublic,
          }),
        });
        updateSaveStatus(res.ok ? "保存済み" : "保存失敗");
      } catch {
        updateSaveStatus("保存失敗");
      }
    },
    [noteId, isPublic, updateSaveStatus]
  );

  // Debounced auto-save
  useEffect(() => {
    if (!noteId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNote(model), 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [model, noteId, saveNote]);

  // --- Cursor blink ---
  useEffect(() => {
    if (!activeNodeId) return;
    setCursorVisible(true);
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, [activeNodeId, cursorPos, editingText]);

  // --- Build current editor state for action functions ---
  const getEditorState = useCallback(
    (): EditorState => ({
      model: modelRef.current,
      activeNodeId,
      editingText,
      cursorPos,
      selectionEnd,
    }),
    [activeNodeId, editingText, cursorPos, selectionEnd]
  );

  // --- Apply state update from an action ---
  const applyUpdate = useCallback(
    (update: StateUpdate) => {
      if (!update) return false;
      if (update.model !== undefined) setModel(update.model);
      // For node changes, resolve the text from the new model
      const targetNodeId =
        update.activeNodeId !== undefined
          ? update.activeNodeId
          : activeNodeId;
      if (update.activeNodeId !== undefined) {
        setActiveNodeId(update.activeNodeId);
        if (update.editingText === undefined && update.activeNodeId) {
          // Changing active node without explicit text: resolve from model
          const m = update.model ?? modelRef.current;
          const node = findNode(m, update.activeNodeId);
          const text = node?.text || "";
          setEditingText(text);
          // Default cursor to end of text
          const pos = update.cursorPos ?? text.length;
          setCursorPos(pos);
          setSelectionEnd(update.selectionEnd ?? pos);
          if (inputRef.current) {
            inputRef.current.value = text;
            inputRef.current.setSelectionRange(pos, update.selectionEnd ?? pos);
            inputRef.current.focus();
          }
          return true;
        }
      }
      if (update.editingText !== undefined) setEditingText(update.editingText);
      if (update.cursorPos !== undefined) setCursorPos(update.cursorPos);
      if (update.selectionEnd !== undefined)
        setSelectionEnd(update.selectionEnd);
      // Sync hidden input
      if (
        update.editingText !== undefined ||
        update.cursorPos !== undefined ||
        update.activeNodeId !== undefined
      ) {
        const text =
          update.editingText ?? editingText;
        const pos = update.cursorPos ?? cursorPos;
        const sel = update.selectionEnd ?? pos;
        if (inputRef.current) {
          inputRef.current.value = text;
          inputRef.current.setSelectionRange(pos, sel);
          inputRef.current.focus();
        }
      }
      return true;
    },
    [activeNodeId, editingText, cursorPos]
  );

  // --- Node activation (for click/dblclick) ---
  const activateNode = useCallback(
    (nodeId: string, cursor?: number) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const modelNode = findNode(modelRef.current, nodeId);
      const text = modelNode?.text || "";
      const pos = cursor ?? text.length;
      applyUpdate({
        activeNodeId: nodeId,
        editingText: text,
        cursorPos: pos,
        selectionEnd: pos,
      });
    },
    [nodes, applyUpdate]
  );

  // --- Input handling ---
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newText = e.target.value;
      setEditingText(newText);
      if (!isComposing && activeNodeId) {
        setModel((prev) => updateNodeText(prev, activeNodeId, newText));
      }
      setTimeout(() => {
        if (inputRef.current) {
          setCursorPos(inputRef.current.selectionStart || 0);
          setSelectionEnd(inputRef.current.selectionEnd || 0);
        }
      }, 0);
    },
    [isComposing, activeNodeId]
  );

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
    if (activeNodeId && inputRef.current) {
      const finalText = inputRef.current.value;
      setEditingText(finalText);
      setModel((prev) => updateNodeText(prev, activeNodeId, finalText));
      setTimeout(() => {
        if (inputRef.current) {
          setCursorPos(inputRef.current.selectionStart || 0);
          setSelectionEnd(inputRef.current.selectionEnd || 0);
        }
      }, 0);
    }
  }, [activeNodeId]);

  const handleSelect = useCallback(() => {
    if (inputRef.current) {
      setCursorPos(inputRef.current.selectionStart || 0);
      setSelectionEnd(inputRef.current.selectionEnd || 0);
    }
  }, []);

  // --- Keyboard handling ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isComposing) return;
      if (!activeNodeId) return;

      const state = getEditorState();
      const pos = inputRef.current?.selectionStart || 0;
      const selEnd = inputRef.current?.selectionEnd || 0;

      if (e.key === "Enter") {
        e.preventDefault();
        applyUpdate(handleEnter(state, pos));
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        applyUpdate(handleTab(state, e.shiftKey));
        return;
      }

      if (e.key === "Backspace" && pos === 0 && pos === selEnd) {
        e.preventDefault();
        applyUpdate(handleBackspaceAtStart(state));
        return;
      }

      if (e.key === "Delete" && pos === selEnd) {
        const update = handleDeleteAtEnd(state, pos);
        if (update) {
          e.preventDefault();
          applyUpdate(update);
          return;
        }
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        applyUpdate(handleArrowUp(state));
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        applyUpdate(handleArrowDown(state));
        return;
      }

      if (e.key === "ArrowLeft") {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
          e.preventDefault();
          applyUpdate(handleCmdShiftLeft(state, pos, selEnd));
          return;
        }
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          applyUpdate(handleCmdLeft(state, pos));
          return;
        }
        if (e.shiftKey) {
          // Shift+Left: let native input handle selection extension
          return;
        }
        if (pos === 0 && pos === selEnd) {
          e.preventDefault();
          applyUpdate(handleArrowLeftEdge(state));
          return;
        }
      }

      if (e.key === "ArrowRight") {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
          e.preventDefault();
          applyUpdate(handleCmdShiftRight(state, pos, selEnd));
          return;
        }
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          applyUpdate(handleCmdRight(state, pos));
          return;
        }
        if (e.shiftKey) {
          // Shift+Right: let native input handle selection extension
          return;
        }
        const currentNode = findNode(modelRef.current, activeNodeId);
        if (
          currentNode &&
          pos >= currentNode.text.length &&
          pos === selEnd
        ) {
          e.preventDefault();
          applyUpdate(handleArrowRightEdge(state));
          return;
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setActiveNodeId(null);
        inputRef.current?.blur();
        return;
      }
    },
    [isComposing, activeNodeId, getEditorState, applyUpdate]
  );

  // --- Title editing ---
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setModel((prev) => updateNodeText(prev, prev.id, newTitle));
    },
    []
  );

  // --- Konva setup ---
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

      const cursorLayer = new Konva.Layer();
      stage.add(cursorLayer);
      cursorLayerRef.current = cursorLayer;

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

      // Click on empty space → deselect (skip if just finished dragging)
      stage.on("click tap", (e: any) => {
        if (wasDraggingRef.current) {
          wasDraggingRef.current = false;
          return;
        }
        if (e.target === stage) {
          setActiveNodeId(null);
        }
      });

      // Drag selection on stage
      stage.on("mousemove", () => {
        const drag = dragStateRef.current;
        if (!drag) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const scale = stage.scaleX();
        const worldX = (pointer.x - stage.x()) / scale;
        const worldY = (pointer.y - stage.y()) / scale;

        // Find the drag target node
        const currentNodes = nodesRef.current;
        const targetNode = currentNodes.find((n) => n.id === drag.nodeId);
        if (!targetNode) return;

        const nodePadding = 20;
        const relX = worldX - targetNode.x - nodePadding;
        const offsets = cursorOffsetsRef.current.get(drag.nodeId);
        let charIdx = 0;
        if (offsets) {
          let bestDist = Math.abs(relX);
          for (let i = 1; i < offsets.length; i++) {
            const d = Math.abs(relX - offsets[i]);
            if (d < bestDist) {
              bestDist = d;
              charIdx = i;
            }
          }
        }

        const start = Math.min(drag.anchorCharIdx, charIdx);
        const end = Math.max(drag.anchorCharIdx, charIdx);
        setCursorPos(start);
        setSelectionEnd(end);
        if (inputRef.current) {
          inputRef.current.setSelectionRange(start, end);
        }
      });

      stage.on("mouseup touchend", () => {
        if (dragStateRef.current) {
          wasDraggingRef.current = true;
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

      // Signal that Konva is ready so the redraw effect can fire
      setKonvaReady(true);
    });

    return () => {
      if (konvaStageRef.current) {
        konvaStageRef.current.destroy();
        konvaStageRef.current = null;
        layerRef.current = null;
        cursorLayerRef.current = null;
      }
    };
  }, []);

  // --- Auto-scroll to active node ---
  useEffect(() => {
    const stage = konvaStageRef.current;
    if (!stage || !activeNodeId) return;

    const activeNode = nodes.find((n) => n.id === activeNodeId);
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
        targetY =
          stageHeight - padding - (activeNode.y + nodeHeight / 2) * scale;
      }

      stage.x(targetX);
      stage.y(targetY);
      layerRef.current?.draw();
    }
  }, [activeNodeId, nodes]);

  // --- Position hidden input at active node for IME ---
  useEffect(() => {
    const stage = konvaStageRef.current;
    if (!stage || !activeNodeId) {
      setInputPos({ x: 0, y: 0 });
      return;
    }
    const activeNode = nodes.find((n) => n.id === activeNodeId);
    if (!activeNode) return;

    const scale = stage.scaleX();
    const offsets = cursorOffsetsRef.current.get(activeNodeId);
    const cursorX = offsets?.[cursorPos] || 0;

    const screenX = (activeNode.x + 20 + cursorX) * scale + stage.x();
    const screenY = activeNode.y * scale + stage.y();
    setInputPos({ x: screenX, y: screenY });
  }, [activeNodeId, nodes, cursorPos, editingText]);

  // --- Redraw canvas ---
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
    const nodePadding = 20;

    nodes.forEach((node) => {
      // For active node during editing, use editingText
      const displayRaw =
        activeNodeId === node.id ? editingText : node.text;
      const isEmpty = displayRaw === "";
      const displayText = isEmpty ? "empty" : displayRaw;

      const t = new Konva.Text({
        text: displayText,
        fontSize: 14,
        fontFamily: "sans-serif",
        fontStyle: isEmpty ? "italic" : "normal",
      });
      textWidths.set(node.id, t.width());

      if (displayRaw.length > 0) {
        const offsets: number[] = [0];
        for (let i = 0; i < displayRaw.length; i++) {
          const partial = new Konva.Text({
            text: displayRaw.substring(0, i + 1),
            fontSize: 14,
            fontFamily: "sans-serif",
          });
          offsets.push(partial.width());
        }
        cursorOffsets.set(node.id, offsets);
      }
    });
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
    nodes.forEach((node, index) => {
      const isRoot = index === 0;
      const displayRaw =
        activeNodeId === node.id ? editingText : node.text;
      const isEmpty = displayRaw === "";
      const isActive = activeNodeId === node.id;
      const displayText = isEmpty ? "empty" : displayRaw;
      const textWidth = textWidths.get(node.id) || 100;
      const rectWidth = Math.max(
        textWidth + nodePadding * 2,
        isRoot ? 100 : 80
      );
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

      // Click → activate node
      group.on("mousedown touchstart", (e: any) => {
        e.cancelBubble = true;
        const stage = konvaStageRef.current;
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const scale = stage.scaleX();
        const clickX =
          (pointer.x - stage.x()) / scale - node.x - nodePadding;

        // Find closest character position
        const offsets = cursorOffsets.get(node.id);
        let charIdx = displayRaw.length;
        if (offsets) {
          let bestIdx = 0;
          let bestDist = Math.abs(clickX);
          for (let i = 1; i < offsets.length; i++) {
            const dist = Math.abs(clickX - offsets[i]);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
          charIdx = bestIdx;
        }

        setActiveNodeId(node.id);
        const modelNode = findNode(modelRef.current, node.id);
        setEditingText(modelNode?.text || "");
        setCursorPos(charIdx);
        setSelectionEnd(charIdx);

        // Start drag selection
        dragStateRef.current = { nodeId: node.id, anchorCharIdx: charIdx };
        const stageRef = konvaStageRef.current;
        if (stageRef) stageRef.draggable(false);

        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(charIdx, charIdx);
          }
        }, 0);
      });

      // Double-click → select all text
      group.on("dblclick dbltap", () => {
        const modelNode = findNode(modelRef.current, node.id);
        if (!modelNode) return;
        setActiveNodeId(node.id);
        setEditingText(modelNode.text);
        setCursorPos(0);
        setSelectionEnd(modelNode.text.length);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(0, modelNode.text.length);
          }
        }, 0);
      });

      layer.add(group);
    });

    layer.draw();
  }, [nodes, activeNodeId, editingText, konvaReady]);

  // --- Cursor layer (lightweight, redraws only on cursor changes) ---
  useEffect(() => {
    const Konva = konvaRef.current;
    const cursorLayer = cursorLayerRef.current;
    if (!Konva || !cursorLayer || !activeNodeId) {
      if (cursorLayer) {
        cursorLayer.destroyChildren();
        cursorLayer.draw();
      }
      return;
    }

    cursorLayer.destroyChildren();

    const activeNode = nodes.find((n) => n.id === activeNodeId);
    if (!activeNode) return;

    const isRoot = nodes.indexOf(activeNode) === 0;
    const nodePadding = 20;
    const offsets = cursorOffsetsRef.current.get(activeNodeId);

    // Selection highlight
    if (cursorPos !== selectionEnd) {
      const selStart = Math.min(cursorPos, selectionEnd);
      const selEndPos = Math.max(cursorPos, selectionEnd);
      const selStartX = offsets?.[selStart] || 0;
      const selEndX = offsets?.[selEndPos] || 0;
      if (selEndX > selStartX) {
        const highlight = new Konva.Rect({
          x: activeNode.x + nodePadding + selStartX,
          y: activeNode.y - 10,
          width: selEndX - selStartX,
          height: 20,
          fill: isRoot
            ? "rgba(255, 255, 255, 0.3)"
            : "rgba(0, 100, 255, 0.2)",
          listening: false,
        });
        cursorLayer.add(highlight);
      }
    }

    // Cursor line
    if (cursorVisible && cursorPos === selectionEnd) {
      const cursorX =
        activeNode.x + nodePadding + (offsets?.[cursorPos] || 0);
      const line = new Konva.Line({
        points: [cursorX, activeNode.y - 10, cursorX, activeNode.y + 10],
        stroke: isRoot ? "#ffffff" : "#000000",
        strokeWidth: 2,
        listening: false,
      });
      cursorLayer.add(line);
    }

    cursorLayer.draw();
  }, [activeNodeId, cursorPos, selectionEnd, cursorVisible, nodes]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={() => noteId && saveNote(model)}
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
                  saveNote(model, newVal);
                }}
              />
              公開
            </label>
            <span
              ref={saveStatusRef}
              className="text-xs text-gray-400 whitespace-nowrap"
            />
          </>
        )}
      </div>
      <div className="flex-1 relative overflow-hidden">
        <div ref={canvasRef} className="absolute inset-0" />
        <input
          ref={inputRef}
          value={editingText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={handleCompositionEnd}
          style={{
            position: "absolute",
            left: `${inputPos.x}px`,
            top: `${inputPos.y}px`,
            width: "1px",
            height: "1px",
            opacity: 0,
            pointerEvents: "none",
            caretColor: "transparent",
            fontSize: "14px",
          }}
        />
      </div>
    </div>
  );
}
