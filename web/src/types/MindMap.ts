/** Tree model stored as JSON */
export interface MindMapModel {
  id: string;
  text: string;
  children: MindMapModel[];
}

/** Flat node for rendering (computed from model via layout) */
export interface MindMapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  children: string[];
}
