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
  cursorPos: number;
  selectionStart: number;
  selectionEnd: number;
  activeNodeId: string | null;
}
