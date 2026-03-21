import type { MindMapNode } from "../types/MindMap";
import { layoutMindMap } from "./treeLayout";

export function parseTextToNodes(text: string): MindMapNode[] {
  const lines = text.split("\n");
  const nodes: MindMapNode[] = [];
  const nodeMap: { [key: string]: MindMapNode } = {};
  const levelStack: { level: number; id: string }[] = [];

  let nodeId = 0;
  let currentPos = 0;

  lines.forEach((line, lineIndex) => {
    const lineStartPos = currentPos;
    const lineEndPos = currentPos + line.length;

    let level = line.search(/\S/);
    const trimmedText = line.trimStart();

    if (trimmedText === "") {
      level =
        levelStack.length > 0
          ? levelStack[levelStack.length - 1].level
          : 0;
    }

    const leadingSpaces = line.length - line.trimStart().length;
    const actualStartPos = lineStartPos + leadingSpaces;
    const actualEndPos = lineEndPos;

    const node: MindMapNode = {
      id: `node_${nodeId++}`,
      text: trimmedText,
      x: 0,
      y: 0,
      children: [],
      lineNumber: lineIndex,
      startPos: actualStartPos,
      endPos: actualEndPos,
      lineStartPos: lineStartPos,
      lineEndPos: lineEndPos,
    };

    nodes.push(node);
    nodeMap[node.id] = node;

    while (
      levelStack.length > 0 &&
      levelStack[levelStack.length - 1].level >= level
    ) {
      levelStack.pop();
    }

    if (levelStack.length > 0) {
      const parent = nodeMap[levelStack[levelStack.length - 1].id];
      if (parent) {
        parent.children.push(node.id);
      }
    }

    levelStack.push({ level, id: node.id });
    currentPos = lineEndPos + 1;
  });

  if (nodes.length > 0) {
    layoutMindMap(nodes);
  }

  return nodes;
}
