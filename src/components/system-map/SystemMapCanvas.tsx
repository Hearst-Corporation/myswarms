"use client";

import "@xyflow/react/dist/style.css";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
} from "@xyflow/react";
import { nodeTypes, nodeColor } from "./MapNode";
import type { MapNode, MapEdge, MapNodeData } from "./types";

/**
 * Surface React Flow isolée — chargée en dynamic({ ssr:false }) par SystemMap
 * pour éviter tout rendu serveur de la lib (mesure/ResizeObserver côté client).
 */
export function SystemMapCanvas({
  nodes,
  edges,
  viewKey,
  onSelect,
  onClear,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  viewKey: string;
  onSelect: (data: MapNodeData) => void;
  onClear: () => void;
}) {
  return (
    <ReactFlow
      key={viewKey}
      nodes={nodes as Node[]}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelect(node.data as MapNodeData)}
      onPaneClick={onClear}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={2}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: false }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-line-strong)" />
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(0,0,0,0.6)"
        nodeColor={(n) => nodeColor(n.data as MapNodeData)}
        nodeStrokeWidth={0}
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
