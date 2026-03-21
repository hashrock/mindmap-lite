export interface MindMapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  children: string[];
  lineNumber: number;
  startPos: number;
  endPos: number;
  lineStartPos?: number;
  lineEndPos?: number;
}

export interface SelectionState {
  // Cursor position: line index in mindmap (0=title, 1+=content) and column within node text
  cursorLine: number;
  cursorCol: number;
  // Selection range as textarea positions (for cross-node highlight calculation)
  selectionStart: number;
  selectionEnd: number;
  activeNodeId: string | null;
}
