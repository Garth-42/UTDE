import { useStepStore } from "../../store/stepStore";
import { S } from "../styles";

const f3 = (v) => Number(v).toFixed(3);
const vec3 = (arr) => arr ? `(${arr.map(f3).join(", ")})` : "—";

function FaceParams({ face }) {
  const p = face.params ?? {};
  switch (face.type) {
    case "plane":
      return (<><Row label="Origin" value={vec3(p.origin)} /><Row label="Normal" value={vec3(p.normal)} /></>);
    case "cylinder":
      return (<><Row label="Center" value={vec3(p.center)} /><Row label="Axis" value={vec3(p.axis)} /><Row label="Radius" value={p.radius != null ? `${f3(p.radius)} mm` : "—"} /><Row label="Height" value={p.height != null ? `${f3(p.height)} mm` : "—"} /></>);
    case "sphere":
      return (<><Row label="Center" value={vec3(p.center)} /><Row label="Radius" value={p.radius != null ? `${f3(p.radius)} mm` : "—"} /></>);
    case "cone":
      return (<><Row label="Apex" value={vec3(p.apex)} /><Row label="Axis" value={vec3(p.axis)} /><Row label="Half angle" value={p.half_angle != null ? `${f3(p.half_angle * 180 / Math.PI)}°` : "—"} /></>);
    default:
      return <Row label="Type" value={face.type} />;
  }
}

function EdgeParams({ edge }) {
  const p = edge.params ?? {};
  switch (edge.type) {
    case "circle":
    case "arc":
      return (<><Row label="Center" value={vec3(p.center)} /><Row label="Axis" value={vec3(p.axis)} /><Row label="Radius" value={p.radius != null ? `${f3(p.radius)} mm` : "—"} /></>);
    case "line":
      return (<><Row label="Start" value={vec3(p.start)} /><Row label="End" value={vec3(p.end)} /><Row label="Length" value={p.length != null ? `${f3(p.length)} mm` : "—"} /></>);
    default:
      return <Row label="Type" value={edge.type} />;
  }
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
      <span style={{ color: "#66667a", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1a1a2e", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default function SelectionInfo() {
  const faces           = useStepStore((s) => s.faces);
  const edges           = useStepStore((s) => s.edges);
  const selectedFaceIds = useStepStore((s) => s.selectedFaceIds);
  const selectedEdgeIds = useStepStore((s) => s.selectedEdgeIds);

  const selFaces = faces.filter((f) => selectedFaceIds.has(f.id));
  const selEdges = edges.filter((e) => selectedEdgeIds.has(e.id));

  if (!selFaces.length && !selEdges.length) return null;

  const lastFace = selFaces[selFaces.length - 1];
  const lastEdge = selEdges[selEdges.length - 1];
  const item = lastEdge ?? lastFace;
  const kind = lastEdge ? "edge" : "face";

  return (
    <div style={{ borderTop: "1px solid #d0d0df", paddingTop: 10, marginTop: 4, fontSize: 10, lineHeight: 1.6 }}>
      <div style={{ ...S.sectionLabel, marginBottom: 8 }}>
        SELECTION — {selectedFaceIds.size + selectedEdgeIds.size} item{selectedFaceIds.size + selectedEdgeIds.size !== 1 ? "s" : ""}
      </div>
      <div style={{ ...S.card }}>
        <div style={{ color: "#6355e0", marginBottom: 6, fontWeight: 700 }}>
          {kind === "edge" ? "Edge" : "Face"} {item.id} — {item.type}
        </div>
        {kind === "face" ? <FaceParams face={item} /> : <EdgeParams edge={item} />}
      </div>
    </div>
  );
}
