import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, Bounds, useBounds } from "@react-three/drei";
import * as THREE from "three";
import { useStepStore } from "../../store/stepStore";
import { useUiStore } from "../../store/uiStore";
import { useGraphStore } from "../../store/graphStore";
import FaceMesh from "./FaceMesh";
import EdgeLine from "./EdgeLine";
import ToolpathLines from "./ToolpathLines";
import OriginIndicator from "./OriginIndicator";

// Auto-fits camera whenever geometry changes
function AutoFit({ faces }) {
  const bounds = useBounds();
  useEffect(() => {
    if (faces.length > 0) bounds.refresh().fit();
  }, [faces, bounds]);
  return null;
}

const AXIS_LEN = 20;

// Shows the user-picked WCS origin as a separate coloured indicator
function WcsGizmo({ origin }) {
  const pos = [origin.x, origin.y, origin.z];

  const xGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, AXIS_LEN, 0, 0], 3));
    return g;
  }, []);
  const yGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, AXIS_LEN, 0], 3));
    return g;
  }, []);
  const zGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, AXIS_LEN], 3));
    return g;
  }, []);

  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[1.5, 12, 12]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
      <line geometry={xGeo}><lineBasicMaterial color="#e53535" linewidth={3} /></line>
      <line geometry={yGeo}><lineBasicMaterial color="#16a34a" linewidth={3} /></line>
      <line geometry={zGeo}><lineBasicMaterial color="#6355e0" linewidth={3} /></line>
    </group>
  );
}

function SceneContent({ faces, edges, selectionMode, showBasePlate, showToolpaths }) {
  const deselectAll     = useStepStore((s) => s.deselectAll);
  const workspaceOrigin = useStepStore((s) => s.workspaceOrigin);
  const showFaces = selectionMode !== "edges";
  const showEdges = selectionMode !== "faces";
  const gridRef = useRef();

  useEffect(() => {
    if (gridRef.current?.material) {
      gridRef.current.material.polygonOffset = true;
      gridRef.current.material.polygonOffsetFactor = 4;
      gridRef.current.material.polygonOffsetUnits = 4;
      gridRef.current.material.needsUpdate = true;
    }
  }, []);

  return (
    <>
      <ambientLight intensity={1.2} color="#f8f8ff" />
      <directionalLight intensity={0.6} color="#ffffff" position={[2, 3, 4]} />
      <directionalLight intensity={0.3} color="#e0e8ff" position={[-2, -1, 1]} />

      {/* Grid bed — 10 mm cells, shader-based anti-aliased lines */}
      {showBasePlate && (
        <Grid
          ref={gridRef}
          args={[600, 600]}
          cellSize={10}
          cellThickness={0.8}
          cellColor="#b0b0c8"
          sectionSize={50}
          sectionThickness={1.4}
          sectionColor="#9090aa"
          fadeDistance={700}
          fadeStrength={1.5}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        />
      )}

      {/* Permanent world-origin coordinate indicator */}
      <OriginIndicator size={30} />

      <Bounds fit clip observe>
        <AutoFit faces={faces} />
        <group onClick={(e) => { if (e.object.userData.kind == null) deselectAll(); }}>
          {showFaces && faces.map((face) => <FaceMesh key={face.id} face={face} />)}
          {showEdges && edges.map((edge) => <EdgeLine key={edge.id} edge={edge} />)}
        </group>
      </Bounds>

      {/* WCS marker at user-picked workspace origin (separate from world origin) */}
      {workspaceOrigin && <WcsGizmo origin={workspaceOrigin} />}

      {showToolpaths && <ToolpathLines />}

      <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
        <GizmoViewport
          axisColors={["#e53535", "#16a34a", "#6355e0"]}
          labelColor="#1a1a2e"
        />
      </GizmoHelper>
    </>
  );
}

function EmptyState() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: "#66667a", fontSize: 13, gap: 10, pointerEvents: "none",
    }}>
      <div style={{ fontSize: 36, opacity: 0.4 }}>◈</div>
      <div>Upload a STEP file to begin</div>
      <div style={{ fontSize: 11, color: "#88889a" }}>
        Requires <code style={{ color: "#6355e0" }}>python step_server.py</code> on port 5174
      </div>
    </div>
  );
}

export default function StepViewport() {
  const faces             = useStepStore((s) => s.faces);
  const edges             = useStepStore((s) => s.edges);
  const isLoading         = useStepStore((s) => s.isLoading);
  const pickingOrigin     = useStepStore((s) => s.pickingOrigin);
  const pickingZOrigin    = useStepStore((s) => s.pickingZOrigin);
  const cancelPickOrigin  = useStepStore((s) => s.cancelPickOrigin);
  const cancelPickZOrigin = useStepStore((s) => s.cancelPickZOrigin);
  const selectionMode     = useUiStore((s) => s.selectionMode);
  const showBasePlate     = useUiStore((s) => s.showBasePlate);
  const showToolpaths     = useUiStore((s) => s.showToolpaths);
  const geometryPick      = useUiStore((s) => s.geometryPick);
  const endGeometryPick   = useUiStore((s) => s.endGeometryPick);
  const selectedFaceIds   = useStepStore((s) => s.selectedFaceIds);
  const selectedEdgeIds   = useStepStore((s) => s.selectedEdgeIds);

  const handleConfirmGeometry = () => {
    if (!geometryPick) return;
    useGraphStore.getState().setNodeGeometry(
      geometryPick.nodeId,
      [...selectedFaceIds],
      [...selectedEdgeIds],
    );
    endGeometryPick();
  };

  const hasGeometry = faces.length > 0 || edges.length > 0;
  const inPickMode  = pickingOrigin || pickingZOrigin;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {!hasGeometry && !isLoading && <EmptyState />}
      {isLoading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "rgba(240,240,245,0.85)", color: "#6355e0", fontSize: 12, zIndex: 10,
        }}>
          Parsing STEP file…
        </div>
      )}
      {/* Geometry pick mode banner */}
      {geometryPick && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
          background: "rgba(99,85,224,0.92)", color: "#fff",
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 16px", fontSize: 12,
        }}>
          <span style={{ flex: 1 }}>
            <strong>Select geometry for</strong> {geometryPick.nodeLabel.toUpperCase()}
            {" — "}click faces or edges, then confirm.
            {"  "}
            <span style={{ opacity: 0.75, fontSize: 11 }}>
              {selectedFaceIds.size} face{selectedFaceIds.size !== 1 ? "s" : ""},
              {" "}{selectedEdgeIds.size} edge{selectedEdgeIds.size !== 1 ? "s" : ""} selected
            </span>
          </span>
          <button
            onClick={handleConfirmGeometry}
            style={{
              background: "#fff", color: "#6355e0", border: "none", borderRadius: 6,
              padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            ✓ Confirm
          </button>
          <button
            onClick={endGeometryPick}
            style={{
              background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer",
            }}
          >
            ✗ Cancel
          </button>
        </div>
      )}

      {pickingOrigin && (
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          background: "rgba(99,85,224,0.08)", border: "1px solid #6355e066", borderRadius: 6,
          color: "#6355e0", fontSize: 11, padding: "5px 12px", zIndex: 10,
          pointerEvents: "none",
        }}>
          Click a point on any edge to set WCS origin — Esc to cancel
        </div>
      )}
      {pickingZOrigin && (
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          background: "rgba(217,119,6,0.08)", border: "1px solid #d9770666", borderRadius: 6,
          color: "#d97706", fontSize: 11, padding: "5px 12px", zIndex: 10,
          pointerEvents: "none",
        }}>
          Click a face or edge point to set Z origin — Esc to cancel
        </div>
      )}
      <Canvas
        camera={{ fov: 50, near: 0.1, far: 100000, position: [0, -300, 200] }}
        style={{ background: "#e8e8f2", cursor: inPickMode ? "crosshair" : "default" }}
        raycaster={{ params: { Line: { threshold: 2 } } }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (pickingOrigin) cancelPickOrigin();
            if (pickingZOrigin) cancelPickZOrigin();
          }
        }}
        tabIndex={0}
      >
        <Suspense fallback={null}>
          <SceneContent faces={faces} edges={edges} selectionMode={selectionMode} showBasePlate={showBasePlate} showToolpaths={showToolpaths} />
          <OrbitControls makeDefault enablePan enableZoom enableRotate />
        </Suspense>
      </Canvas>
    </div>
  );
}
