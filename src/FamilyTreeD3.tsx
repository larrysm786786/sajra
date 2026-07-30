import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import * as d3 from "d3";
import type { Language, Member } from "./types";
import { buildTree, calculateAge, displayName, photoSrc } from "./lib";

type ViewMode = "horizontal" | "vertical" | "boxes";

interface NodeDatum {
  member: Member | null;
  children?: NodeDatum[];
  _branchColor?: string;
}

interface HNode extends d3.HierarchyNode<NodeDatum> {
  nodeId?: number;
  _children?: HNode[] | null;
  x0?: number;
  y0?: number;
}

const CARD_W_MIN = 110;
const CARD_W_MAX = 190;
const CARD_H = 132;
const PHOTO_R = 26;
const PHOTO_CY = -CARD_H / 2 + 12 + PHOTO_R;
const NAME_Y = PHOTO_CY + PHOTO_R + 16;
const DOB_Y = NAME_Y + 15;
const ADDS_Y = DOB_Y + 13;
const ROOT_COLOR = "#dc2626";
const BRANCH_COLORS = [
  "#16a34a", "#2563eb", "#d97706", "#0f766e", "#7c3aed",
  "#a16207", "#ec4899", "#0891b2", "#65a30d", "#9333ea"
];

const LAYOUTS: Record<ViewMode, { dx: number; dy: number }> = {
  horizontal: { dx: 40, dy: 180 },
  vertical: { dx: 110, dy: 90 },
  boxes: { dx: 220, dy: 190 }
};

interface Props {
  members: Member[];
  language: Language;
  onOpenMember: (id: number) => void;
}

export default function FamilyTreeD3({ members, language, onOpenMember }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<(query: string) => void>(() => {});
  const [viewMode, setViewMode] = useState<ViewMode>("horizontal");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const onOpenRef = useRef(onOpenMember);
  onOpenRef.current = onOpenMember;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setMessage("");

    const roots = buildTree(members);
    if (roots.length === 0) {
      container.innerHTML = '<p class="hint">No members yet.</p>';
      return;
    }

    const data: NodeDatum =
      roots.length === 1
        ? { member: roots[0].member, children: roots[0].children as unknown as NodeDatum[] }
        : { member: null, children: roots as unknown as NodeDatum[] };

    const width = container.clientWidth || 1000;
    const height = 700;

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height] as unknown as string);

    const g = svg.append("g");

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 2]).on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    svg.call(zoomBehavior as never);

    function initialTransform() {
      return viewMode === "horizontal"
        ? d3.zoomIdentity.translate(80, height / 2)
        : d3.zoomIdentity.translate(width / 2, 60);
    }
    svg.call((zoomBehavior as never as { transform: never }).transform as never, initialTransform() as never);

    const root = d3.hierarchy<NodeDatum>(data) as HNode;
    (root as HNode).x0 = 0;
    (root as HNode).y0 = 0;

    assignBranchColors(root);

    const allNodes = root.descendants() as HNode[];
    allNodes.forEach((d, i) => {
      d.nodeId = i;
      d._children = d.children as HNode[] | undefined ?? null;
    });

    let highlightedNodeId: number | undefined;
    let highlightedAncestorIds = new Set<number>();

    function assignBranchColors(node: HNode) {
      node.data._branchColor = ROOT_COLOR;
      (node.children ?? []).forEach((child, i) => {
        paintBranch(child as HNode, BRANCH_COLORS[i % BRANCH_COLORS.length]);
      });
    }
    function paintBranch(node: HNode, color: string) {
      node.data._branchColor = color;
      (node.children ?? []).forEach((child) => paintBranch(child as HNode, color));
    }

    function nodeName(d: HNode): string {
      return d.data.member ? displayName(d.data.member, language) : "Sajra";
    }
    function dobLineFor(d: HNode): string {
      if (!d.data.member) return "";
      const age = calculateAge(d.data.member.dob, d.data.member.dod);
      return age !== null ? `DOB: ${age}` : "";
    }
    function addsLineFor(d: HNode): string {
      return d.data.member?.birthplace ? `Adds: ${d.data.member.birthplace}` : "";
    }
    function truncateToWidth(text: string, maxWidth: number, charWidth = 6.2): string {
      const maxChars = Math.max(1, Math.floor((maxWidth - 16) / charWidth));
      if (text.length <= maxChars) return text;
      return text.slice(0, Math.max(1, maxChars - 1)) + "…";
    }
    function cardWidthFor(d: HNode): number {
      const lines = [nodeName(d), dobLineFor(d), addsLineFor(d)];
      const longest = Math.max(...lines.map((l) => l.length));
      const estimated = Math.ceil(longest * 6.2) + 24;
      return Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, estimated));
    }

    function toScreen(x: number, y: number): [number, number] {
      return viewMode === "horizontal" ? [y, x] : [x, y];
    }
    function transformFor(x: number, y: number): string {
      const [sx, sy] = toScreen(x, y);
      return `translate(${sx},${sy})`;
    }
    function elbowPath(d: d3.HierarchyLink<NodeDatum>): string {
      const [sx, sy] = toScreen((d.source as HNode).x!, (d.source as HNode).y!);
      const [tx, ty] = toScreen((d.target as HNode).x!, (d.target as HNode).y!);
      const syEdge = sy + CARD_H / 2;
      const tyEdge = ty - CARD_H / 2;
      const midY = (syEdge + tyEdge) / 2;
      return `M${sx},${syEdge}V${midY}H${tx}V${tyEdge}`;
    }
    function makeLinkGenerator(): (d: d3.HierarchyLink<NodeDatum>) => string {
      if (viewMode === "boxes") return elbowPath;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gen: any = viewMode === "horizontal" ? d3.linkHorizontal() : d3.linkVertical();
      gen.x((node: { x: number; y: number }) => toScreen(node.x, node.y)[0]);
      gen.y((node: { x: number; y: number }) => toScreen(node.x, node.y)[1]);
      return gen as (d: d3.HierarchyLink<NodeDatum>) => string;
    }

    function update(source: HNode) {
      const { dx, dy } = LAYOUTS[viewMode];
      d3.tree<NodeDatum>().nodeSize([dx, dy])(root);

      const nodes = root.descendants() as HNode[];
      const links = root.links();
      const linkGen = makeLinkGenerator();
      const isBoxes = viewMode === "boxes";

      const node = g.selectAll<SVGGElement, HNode>("g.node").data(nodes, (d) => String(d.nodeId));

      const nodeEnter = node
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", () => transformFor(source.x0 ?? 0, source.y0 ?? 0))
        .on("click", (_event, d) => {
          d.children = d.children ? undefined : (d._children ?? undefined);
          update(d);
        });

      if (isBoxes) {
        nodeEnter
          .append("rect")
          .attr("class", "org-card")
          .attr("x", (d) => -cardWidthFor(d) / 2)
          .attr("y", -CARD_H / 2)
          .attr("width", (d) => cardWidthFor(d))
          .attr("height", CARD_H)
          .attr("rx", 14)
          .attr("fill", (d) => d.data._branchColor || "#334155");

        nodeEnter
          .append("circle")
          .attr("class", "org-card-ring")
          .attr("cx", 0)
          .attr("cy", PHOTO_CY)
          .attr("r", PHOTO_R + 3)
          .attr("fill", "#ffffff");

        nodeEnter
          .append("clipPath")
          .attr("id", (d) => `photo-clip-${d.nodeId}`)
          .append("circle")
          .attr("cx", 0)
          .attr("cy", PHOTO_CY)
          .attr("r", PHOTO_R);

        nodeEnter
          .append("image")
          .attr("class", "org-card-photo")
          .attr("x", -PHOTO_R)
          .attr("y", PHOTO_CY - PHOTO_R)
          .attr("width", PHOTO_R * 2)
          .attr("height", PHOTO_R * 2)
          .attr("clip-path", (d) => `url(#photo-clip-${d.nodeId})`)
          .attr("href", (d) => (d.data.member ? photoSrc(d.data.member.photo) : ""));

        nodeEnter
          .append("text")
          .attr("class", "org-card-name")
          .attr("text-anchor", "middle")
          .attr("y", NAME_Y)
          .attr("dy", "0.32em")
          .text((d) => truncateToWidth(nodeName(d), cardWidthFor(d)));

        nodeEnter
          .append("text")
          .attr("class", "org-card-detail")
          .attr("text-anchor", "middle")
          .attr("y", DOB_Y)
          .attr("dy", "0.32em")
          .text((d) => truncateToWidth(dobLineFor(d), cardWidthFor(d)));

        nodeEnter
          .append("text")
          .attr("class", "org-card-detail")
          .attr("text-anchor", "middle")
          .attr("y", ADDS_Y)
          .attr("dy", "0.32em")
          .text((d) => truncateToWidth(addsLineFor(d), cardWidthFor(d)));

        nodeEnter.on("dblclick", (event, d) => {
          event.stopPropagation();
          if (d.data.member) onOpenRef.current(d.data.member.id);
        });
      } else {
        nodeEnter.append("circle").attr("r", 6);

        nodeEnter
          .append("text")
          .attr("dy", "0.31em")
          .attr("x", (d) => (viewMode === "horizontal" ? (d._children ? -10 : 10) : 0))
          .attr("y", (d) => (viewMode === "vertical" ? (d._children ? -14 : 14) : 0))
          .attr("text-anchor", (d) => (viewMode === "horizontal" ? (d._children ? "end" : "start") : "middle"))
          .text((d) => nodeName(d))
          .clone(true)
          .lower()
          .attr("stroke", "white")
          .attr("stroke-width", 3);

        nodeEnter.on("dblclick", (event, d) => {
          event.stopPropagation();
          if (d.data.member) onOpenRef.current(d.data.member.id);
        });
      }

      const nodeMerge = node.merge(nodeEnter);

      nodeMerge.transition().duration(400).attr("transform", (d) => transformFor(d.x!, d.y!));

      if (isBoxes) {
        nodeMerge.select("rect.org-card").classed("highlighted", (d) => d.nodeId === highlightedNodeId);
      } else {
        nodeMerge
          .select("circle")
          .attr("class", (d) => "gender-" + (d.data.member?.gender ?? "root"))
          .classed("highlighted", (d) => d.nodeId === highlightedNodeId)
          .attr("r", (d) => (d.nodeId === highlightedNodeId ? 9 : 6));
      }

      node
        .exit()
        .transition()
        .duration(400)
        .attr("transform", () => transformFor(source.x!, source.y!))
        .remove();

      const link = g.selectAll<SVGPathElement, d3.HierarchyLink<NodeDatum>>("path.link").data(links, (d) => String((d.target as HNode).nodeId));

      const linkEnter = link
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", () => {
          const o = { x: source.x0 ?? 0, y: source.y0 ?? 0 };
          return linkGen({ source: o, target: o } as unknown as d3.HierarchyLink<NodeDatum>);
        });

      link
        .merge(linkEnter)
        .attr("class", (d) => (highlightedAncestorIds.has((d.target as HNode).nodeId!) ? "link highlighted-link" : "link"))
        .transition()
        .duration(400)
        .attr("d", linkGen);

      link.exit().remove();

      root.descendants().forEach((d) => {
        (d as HNode).x0 = (d as HNode).x;
        (d as HNode).y0 = (d as HNode).y;
      });
    }

    update(root);

    function centerOnNode(node: HNode) {
      const [sx, sy] = toScreen(node.x!, node.y!);
      const x = width / 2 - sx;
      const y = height / 2 - sy;
      svg
        .transition()
        .duration(600)
        .call((zoomBehavior as never as { transform: never }).transform as never, d3.zoomIdentity.translate(x, y) as never);
    }

    findRef.current = (q: string) => {
      const query = q.trim().toLowerCase();
      if (!query) return;

      const match =
        allNodes.find((d) => nodeName(d).toLowerCase() === query) ||
        allNodes.find((d) => nodeName(d).toLowerCase().includes(query));

      if (!match) {
        setMessage(`No member found with the name "${q}".`);
        return;
      }
      setMessage("");

      const chain: HNode[] = [];
      let ancestor = match.parent as HNode | null;
      while (ancestor) {
        chain.push(ancestor);
        ancestor = ancestor.parent as HNode | null;
      }
      chain.forEach((a) => {
        if (a._children) a.children = a._children;
      });

      highlightedNodeId = match.nodeId;
      highlightedAncestorIds = new Set([match.nodeId!, ...chain.map((a) => a.nodeId!)]);

      update(match);
      centerOnNode(match);
    };

    return () => {
      container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, language, viewMode]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    findRef.current(query);
  }

  return (
    <div>
      <div className="view-toggle">
        <button
          type="button"
          className={`view-toggle-btn${viewMode === "horizontal" ? " active" : ""}`}
          onClick={() => setViewMode("horizontal")}
        >
          Left → Right
        </button>
        <button
          type="button"
          className={`view-toggle-btn${viewMode === "vertical" ? " active" : ""}`}
          onClick={() => setViewMode("vertical")}
        >
          Top ↓ Down
        </button>
        <button
          type="button"
          className={`view-toggle-btn${viewMode === "boxes" ? " active" : ""}`}
          onClick={() => setViewMode("boxes")}
        >
          Colorful Box Chart
        </button>
      </div>

      <form onSubmit={handleSearch} className="tree-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a name to search..."
          autoComplete="off"
        />
        <button type="submit" className="btn-ghost">
          Show My Position
        </button>
      </form>
      {message && <p className="hint">{message}</p>}

      <div ref={containerRef} id="tree-container"></div>
      <p className="hint">Click a node to expand/collapse. Double-click to open the profile. Scroll to zoom, drag to pan.</p>
    </div>
  );
}
