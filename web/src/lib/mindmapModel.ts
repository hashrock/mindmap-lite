import type { MindMapModel, MindMapNode } from "../types/MindMap";

let _nextId = 0;

export function generateId(): string {
  return `node_${_nextId++}`;
}

export function resetIdCounter(start = 0): void {
  _nextId = start;
}

/** Deep clone a model tree */
export function cloneModel(model: MindMapModel): MindMapModel {
  return JSON.parse(JSON.stringify(model));
}

/** Find a node by ID in the tree */
export function findNode(
  model: MindMapModel,
  id: string
): MindMapModel | null {
  if (model.id === id) return model;
  for (const child of model.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Find parent of a node and its index in parent.children */
export function findParentAndIndex(
  model: MindMapModel,
  id: string
): { parent: MindMapModel; index: number } | null {
  for (let i = 0; i < model.children.length; i++) {
    if (model.children[i].id === id) {
      return { parent: model, index: i };
    }
    const found = findParentAndIndex(model.children[i], id);
    if (found) return found;
  }
  return null;
}

/** Get DFS order of node IDs (display/navigation order) */
export function getFlatOrder(model: MindMapModel): string[] {
  const result: string[] = [];
  function walk(node: MindMapModel) {
    result.push(node.id);
    for (const child of node.children) walk(child);
  }
  walk(model);
  return result;
}

/** Flatten model tree to MindMapNode[] for layout/rendering */
export function flattenToNodes(model: MindMapModel): MindMapNode[] {
  const nodes: MindMapNode[] = [];
  function walk(m: MindMapModel) {
    nodes.push({
      id: m.id,
      text: m.text,
      x: 0,
      y: 0,
      children: m.children.map((c) => c.id),
    });
    for (const child of m.children) walk(child);
  }
  walk(model);
  return nodes;
}

// --- Mutation functions (all return new model) ---

/** Update a node's text */
export function updateNodeText(
  model: MindMapModel,
  nodeId: string,
  text: string
): MindMapModel {
  const cloned = cloneModel(model);
  const node = findNode(cloned, nodeId);
  if (node) node.text = text;
  return cloned;
}

/** Add a sibling after a given node */
export function addSiblingAfter(
  model: MindMapModel,
  afterId: string,
  newNode: MindMapModel
): MindMapModel {
  const cloned = cloneModel(model);
  // If afterId is root, add as first child
  if (cloned.id === afterId) {
    cloned.children.push(newNode);
    return cloned;
  }
  const result = findParentAndIndex(cloned, afterId);
  if (!result) return cloned;
  result.parent.children.splice(result.index + 1, 0, newNode);
  return cloned;
}

/** Add a child to a node (at end) */
export function addChildToNode(
  model: MindMapModel,
  parentId: string,
  newNode: MindMapModel
): MindMapModel {
  const cloned = cloneModel(model);
  const parent = findNode(cloned, parentId);
  if (parent) parent.children.push(newNode);
  return cloned;
}

/** Remove a node. Children are promoted to the parent level. */
export function removeNode(
  model: MindMapModel,
  nodeId: string
): MindMapModel {
  const cloned = cloneModel(model);
  // Can't remove root
  if (cloned.id === nodeId) return cloned;
  const result = findParentAndIndex(cloned, nodeId);
  if (!result) return cloned;
  const removed = result.parent.children.splice(result.index, 1)[0];
  // Promote children
  result.parent.children.splice(result.index, 0, ...removed.children);
  return cloned;
}

/** Indent node: make it the last child of its previous sibling */
export function indentNode(
  model: MindMapModel,
  nodeId: string
): MindMapModel {
  const cloned = cloneModel(model);
  if (cloned.id === nodeId) return cloned; // can't indent root
  const result = findParentAndIndex(cloned, nodeId);
  if (!result || result.index === 0) return cloned; // no previous sibling
  const [node] = result.parent.children.splice(result.index, 1);
  const prevSibling = result.parent.children[result.index - 1];
  prevSibling.children.push(node);
  return cloned;
}

/** Dedent node: move to parent's level, after parent */
export function dedentNode(
  model: MindMapModel,
  nodeId: string
): MindMapModel {
  const cloned = cloneModel(model);
  if (cloned.id === nodeId) return cloned;
  const result = findParentAndIndex(cloned, nodeId);
  if (!result) return cloned;
  // Parent must not be root's direct child... actually parent must have a grandparent
  const grandResult = findParentAndIndex(cloned, result.parent.id);
  if (!grandResult) return cloned; // parent is root, can't dedent further
  const [node] = result.parent.children.splice(result.index, 1);
  const parentIdx = grandResult.index;
  grandResult.parent.children.splice(parentIdx + 1, 0, node);
  return cloned;
}

/**
 * Split a node at cursor position.
 * Text before cursor stays, text after goes to a new sibling.
 */
export function splitNode(
  model: MindMapModel,
  nodeId: string,
  atPos: number
): { model: MindMapModel; newNodeId: string } {
  const newNodeId = generateId();
  const cloned = cloneModel(model);
  const node = findNode(cloned, nodeId);
  if (!node) return { model: cloned, newNodeId };
  const textAfter = node.text.substring(atPos);
  node.text = node.text.substring(0, atPos);
  const newNode: MindMapModel = { id: newNodeId, text: textAfter, children: [] };

  if (cloned.id === nodeId) {
    // Splitting root: add as first child
    cloned.children.unshift(newNode);
  } else {
    const result = findParentAndIndex(cloned, nodeId);
    if (result) {
      result.parent.children.splice(result.index + 1, 0, newNode);
    }
  }
  return { model: cloned, newNodeId };
}

// --- Conversion from legacy text format ---

/** Convert indented plain text to MindMapModel */
export function textToModel(title: string, content: string): MindMapModel {
  resetIdCounter();
  const root: MindMapModel = {
    id: generateId(),
    text: title,
    children: [],
  };

  if (!content || content.trim() === "") return root;

  const lines = content.split("\n");
  const stack: { node: MindMapModel; depth: number }[] = [
    { node: root, depth: -1 },
  ];

  for (const line of lines) {
    if (line.trim() === "") continue;
    const depth = line.search(/\S/);
    const text = line.trim();
    const newNode: MindMapModel = {
      id: generateId(),
      text,
      children: [],
    };

    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].node.children.push(newNode);
    stack.push({ node: newNode, depth });
  }

  return root;
}

/** Parse content string: try JSON first, fall back to legacy text */
export function parseContent(
  content: string | undefined,
  title: string | undefined
): MindMapModel {
  if (!content) {
    return createDefaultModel(title);
  }

  // Try JSON
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.id === "string" && typeof parsed.text === "string") {
      // Ensure IDs don't collide with generateId
      const maxId = findMaxNumericId(parsed);
      resetIdCounter(maxId + 1);
      return parsed as MindMapModel;
    }
  } catch {
    // Not JSON, try legacy format
  }

  return textToModel(title || "Mindmap", content);
}

function findMaxNumericId(model: MindMapModel): number {
  let max = 0;
  const match = model.id.match(/^node_(\d+)$/);
  if (match) max = parseInt(match[1], 10);
  for (const child of model.children) {
    max = Math.max(max, findMaxNumericId(child));
  }
  return max;
}

export function createDefaultModel(title?: string): MindMapModel {
  resetIdCounter();
  return {
    id: generateId(),
    text: title || "Mindmap Lite",
    children: [
      {
        id: generateId(),
        text: "使い方",
        children: [
          { id: generateId(), text: "ノードをクリックして編集", children: [] },
          { id: generateId(), text: "Enterで兄弟ノード追加", children: [] },
          { id: generateId(), text: "Tabでインデント", children: [] },
        ],
      },
      {
        id: generateId(),
        text: "特徴",
        children: [
          { id: generateId(), text: "リアルタイムプレビュー", children: [] },
          { id: generateId(), text: "JSONベース", children: [] },
          { id: generateId(), text: "シンプル", children: [] },
        ],
      },
    ],
  };
}
