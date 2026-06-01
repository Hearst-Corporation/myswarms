import type { Node, Edge } from "@xyflow/react";

// ── Catégories de nœuds (couleur + libellé) ─────────────────────────────────
export type NodeKind =
  | "user"
  | "frontend"
  | "backend"
  | "data"
  | "table"
  | "template"
  | "dashboard"
  | "report"
  | "input"
  | "agent";

// ── Statut visuel ───────────────────────────────────────────────────────────
export type MapStatus =
  | "completed"
  | "running"
  | "failed"
  | "static"
  | "template"
  | "data"
  | "report";

export interface PanelLink {
  label: string;
  href: string;
}

export interface PanelDetail {
  title: string;
  rows: { label: string; value: string }[];
  body?: string;
  bodyLabel?: string;
  links?: PanelLink[];
}

// Donnée portée par un nœud React Flow. Intersection avec Record<string, unknown>
// pour satisfaire la contrainte générique de @xyflow/react (Node<Data>).
export type MapNodeData = {
  label: string;
  kind: NodeKind;
  sub?: string;
  status?: MapStatus;
  desc?: string;
  detail?: PanelDetail;
} & Record<string, unknown>;

export type MapNode = Node<MapNodeData>;
export type MapEdge = Edge;

// ── Payload server → client (données réelles du dernier run) ─────────────────
export interface AgentSlot {
  name: string;
  role: string;
  provider: string;
  model: string;
  taskName: string | null;
  objective: string | null;
  expectedOutput: string | null;
  status: MapStatus;
  statusRaw: string;
  outputExcerpt: string | null;
  tokens: number | null;
}

export interface RunInfo {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  tokensIn: number;
  tokensOut: number;
  steps: number;
  recommendation: "APPELER" | "ATTENDRE" | "ÉVITER" | "UNKNOWN";
}

export interface InputField {
  key: string;
  label: string;
  value: string;
}

export interface SystemMapData {
  available: boolean;
  swarmId: string;
  /** Nom canonique affiché (le champ name stocké en base est corrompu — cf. storedName). */
  displayName: string;
  /** Valeur réelle du champ swarms.name en base (peut être "No owner"). */
  storedName: string | null;
  isTemplate: boolean;
  inputFields: InputField[];
  agents: AgentSlot[];
  run: RunInfo | null;
  reportExcerpt: string | null;
  loadError: string | null;
}
