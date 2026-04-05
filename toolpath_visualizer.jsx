import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

// ── Demo toolpath generators ──
function generateHelixPoints(radius, pitch, turns, ptsPerTurn) {
  const pts = [];
  const total = turns * ptsPerTurn;
  for (let i = 0; i <= total; i++) {
    const angle = (2 * Math.PI * i) / ptsPerTurn;
    const z = (pitch * i) / ptsPerTurn;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    pts.push({ x, y, z, nx, ny, nz: 0 });
  }
  return pts;
}

function generateCirclePoints(radius, z, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const angle = (2 * Math.PI * i) / n;
    pts.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      z,
      nx: Math.cos(angle),
      ny: Math.sin(angle),
      nz: 0,
    });
  }
  return pts;
}

function generateRasterPoints(size, z, spacing) {
  const pts = [];
  const half = size / 2;
  let forward = true;
  for (let v = -half; v <= half; v += spacing) {
    const start = forward ? -half : half;
    const end = forward ? half : -half;
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push({ x: start + (end - start) * t, y: v, z, nx: 0, ny: 0, nz: 1 });
    }
    forward = !forward;
  }
  return pts;
}

// ── Toolpath Three.js scene ──
function createScene(container, paths, activeIndices, showNormals, animProgress) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e17);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
  camera.position.set(100, 80, 120);
  camera.lookAt(0, 0, 30);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x4477aa, 0.6));
  const dir1 = new THREE.DirectionalLight(0xffeedd, 0.8);
  dir1.position.set(50, 80, 100);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0x88aaff, 0.3);
  dir2.position.set(-50, -30, 60);
  scene.add(dir2);

  const grid = new THREE.GridHelper(200, 20, 0x1a2744, 0x111b2e);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const cylGeo = new THREE.CylinderGeometry(40, 40, 80, 48, 1, true);
  const cylMat = new THREE.MeshPhongMaterial({ color: 0x1a3355, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const cylMesh = new THREE.Mesh(cylGeo, cylMat);
  cylMesh.rotation.x = Math.PI / 2;
  cylMesh.position.z = 40;
  scene.add(cylMesh);

  const wireGeo = new THREE.CylinderGeometry(40, 40, 80, 24, 4, true);
  const wireMesh = new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({ color: 0x2a5588, wireframe: true, transparent: true, opacity: 0.15 }));
  wireMesh.rotation.x = Math.PI / 2;
  wireMesh.position.z = 40;
  scene.add(wireMesh);

  const colors = [0x00ccff, 0xff6633, 0x44dd88, 0xffcc00];
  paths.forEach((path, pi) => {
    if (!activeIndices.has(pi)) return;
    const color = colors[pi % colors.length];
    const maxPts = Math.floor(path.length * animProgress);
    if (maxPts < 2) return;
    const positions = [];
    for (let i = 0; i < maxPts; i++) positions.push(path[i].x, path[i].y, path[i].z);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, linewidth: 2 })));
    if (showNormals) {
      const step = Math.max(1, Math.floor(maxPts / 30));
      for (let i = 0; i < maxPts; i += step) {
        const p = path[i];
        const dir = new THREE.Vector3(p.nx, p.ny, p.nz).normalize();
        scene.add(new THREE.ArrowHelper(dir, new THREE.Vector3(p.x, p.y, p.z), 8, color, 2, 1.5));
      }
    }
    if (maxPts > 0) {
      const last = path[maxPts - 1];
      const toolMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.8 })
      );
      toolMesh.position.set(last.x, last.y, last.z);
      scene.add(toolMesh);
    }
  });

  const axLen = 15;
  [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)].forEach((d, i) => {
    scene.add(new THREE.ArrowHelper(d, new THREE.Vector3(-90, -90, 0), axLen, [0xff4444, 0x44ff44, 0x4488ff][i], 3, 2));
  });

  return { scene, camera, renderer };
}

// ── STEP face type colors ──
const FACE_COLORS = {
  plane:    0x4488cc,
  cylinder: 0x44ccaa,
  sphere:   0x44cc88,
  cone:     0xcc8844,
  torus:    0xcc44aa,
  other:    0x445566,
};
const FACE_SELECTED_COLOR = 0xff8800;
const FACE_HOVER_COLOR    = 0xffcc44;

// ── Python code generator ──
function generatePythonCode(faces) {
  if (!faces.length) return "";
  const f4 = (v) => Number(v).toFixed(4);
  const vec = (arr) => `(${arr.map(f4).join(", ")})`;

  const lines = [
    "# Generated by UTDE Toolpath Visualizer",
    "from toolpath_engine import Surface, GeometryModel",
    "",
    'model = GeometryModel(name="imported_step")',
    "",
  ];

  faces.forEach((face) => {
    const p = face.params;
    const varName = `surface_${face.id}`;
    lines.push(`# Face ${face.id} — ${face.type}`);

    if (face.type === "plane" && p.origin && p.normal) {
      lines.push(`${varName} = Surface.plane(`);
      lines.push(`    origin=${vec(p.origin)},`);
      lines.push(`    normal=${vec(p.normal)},`);
      lines.push(`    name="face_${face.id}",`);
      lines.push(`)`);
    } else if (face.type === "cylinder" && p.center != null && p.radius != null) {
      const axis = p.axis || [0, 0, 1];
      const height = p.height != null ? f4(p.height) : "100.0  # estimate";
      lines.push(`${varName} = Surface.cylinder(`);
      lines.push(`    center=${vec(p.center)},`);
      lines.push(`    axis=${vec(axis)},`);
      lines.push(`    radius=${f4(p.radius)},`);
      lines.push(`    height=${height},`);
      lines.push(`    name="face_${face.id}",`);
      lines.push(`)`);
    } else if (face.type === "sphere" && p.center != null && p.radius != null) {
      lines.push(`${varName} = Surface.sphere(`);
      lines.push(`    center=${vec(p.center)},`);
      lines.push(`    radius=${f4(p.radius)},`);
      lines.push(`    name="face_${face.id}",`);
      lines.push(`)`);
    } else {
      lines.push(`# ${face.type} surface — no direct Surface mapping`);
      lines.push(`${varName} = None  # TODO: implement mesh surface for '${face.type}'`);
    }

    lines.push(`if ${varName}:`);
    lines.push(`    model.add_surface(${varName}, tags=["imported", "${face.type}"])`);
    lines.push("");
  });

  lines.push("# Access surfaces by tag");
  lines.push('# planes    = model.select_surfaces(tag="plane")');
  lines.push('# cylinders = model.select_surfaces(tag="cylinder")');

  return lines.join("\n");
}

// ── Main Component ──
export default function ToolpathVisualizer() {
  // Toolpath state
  const containerRef    = useRef(null);
  const rotationRef     = useRef({ x: 0.4, y: 0 });
  const isDragging      = useRef(false);
  const lastMouse       = useRef({ x: 0, y: 0 });
  const zoomRef         = useRef(1);
  const [activePaths, setActivePaths]   = useState(new Set([0, 1]));
  const [showNormals, setShowNormals]   = useState(true);
  const [animProgress, setAnimProgress] = useState(1);
  const [isAnimating, setIsAnimating]   = useState(false);
  const animRef = useRef(null);
  const pathData = useRef([
    generateHelixPoints(40, 5, 4, 72),
    generateCirclePoints(40, 20, 64),
    generateRasterPoints(50, 82, 5),
  ]);
  const pathLabels = ["Helix DED Weld", "Ring Weld Pass", "Raster Fill (Top)"];
  const pathColors = ["#00ccff", "#ff6633", "#44dd88"];

  // Mode
  const [mode, setMode] = useState("toolpath"); // "toolpath" | "step"

  // STEP state
  const stepContainerRef  = useRef(null);
  const stepRendererRef   = useRef(null);
  const stepSceneRef      = useRef(null);
  const stepCameraRef     = useRef(null);
  const stepFaceMeshesRef = useRef([]);    // Three.Mesh[] indexed by face array position
  const stepRafRef        = useRef(null);
  const stepRotRef        = useRef({ x: 0.5, y: 0.3 });
  const stepZoomRef       = useRef(1);
  const stepDragRef       = useRef(false);
  const stepLastMouseRef  = useRef({ x: 0, y: 0 });
  const stepDragMovedRef  = useRef(false);  // distinguish click vs drag
  const stepCenterRef     = useRef(new THREE.Vector3());
  const stepDistRef       = useRef(300);

  const [stepFaces, setStepFaces]           = useState([]);
  const [selectedFaceIds, setSelectedFaceIds] = useState(new Set());
  const [isLoadingStep, setIsLoadingStep]   = useState(false);
  const [stepError, setStepError]           = useState(null);
  const [isDragOver, setIsDragOver]         = useState(false);
  const [generatedCode, setGeneratedCode]   = useState("");
  const [codeCopied, setCodeCopied]         = useState(false);
  const SERVER = "http://localhost:5174";

  // ── Toolpath render ──
  const render = useCallback(() => {
    if (!containerRef.current) return;
    const { scene, camera, renderer } = createScene(
      containerRef.current, pathData.current, activePaths, showNormals, animProgress
    );
    const dist = 160 / zoomRef.current;
    const rx = rotationRef.current.x;
    const ry = rotationRef.current.y;
    camera.position.set(
      dist * Math.sin(ry) * Math.cos(rx),
      dist * Math.cos(ry) * Math.cos(rx),
      dist * Math.sin(rx) + 40
    );
    camera.lookAt(0, 0, 35);
    camera.up.set(0, 0, 1);
    renderer.render(scene, camera);
    renderer.dispose();
  }, [activePaths, showNormals, animProgress]);

  useEffect(() => { if (mode === "toolpath") render(); }, [render, mode]);
  useEffect(() => {
    const onResize = () => { if (mode === "toolpath") render(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [render, mode]);

  // Toolpath mouse
  const handleMouseDown = (e) => { isDragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    rotationRef.current.y += dx * 0.008;
    rotationRef.current.x = Math.max(-1.2, Math.min(1.5, rotationRef.current.x + dy * 0.008));
    lastMouse.current = { x: e.clientX, y: e.clientY };
    render();
  };
  const handleMouseUp   = () => { isDragging.current = false; };
  const handleWheel     = (e) => { zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current + e.deltaY * -0.002)); render(); };

  const togglePath = (i) => {
    setActivePaths((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  };

  const startAnimation = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setIsAnimating(true);
    let t = 0;
    const step = () => {
      t += 0.006;
      if (t >= 1) { t = 1; setIsAnimating(false); }
      setAnimProgress(t);
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    setAnimProgress(0);
    animRef.current = requestAnimationFrame(step);
  };

  // ── STEP scene init ──
  const updateStepCamera = useCallback(() => {
    const camera = stepCameraRef.current;
    if (!camera) return;
    const center = stepCenterRef.current;
    const dist   = stepDistRef.current / stepZoomRef.current;
    const rx = stepRotRef.current.x;
    const ry = stepRotRef.current.y;
    camera.position.set(
      center.x + dist * Math.sin(ry) * Math.cos(rx),
      center.y + dist * Math.cos(ry) * Math.cos(rx),
      center.z + dist * Math.sin(rx)
    );
    camera.lookAt(center);
    camera.up.set(0, 0, 1);
  }, []);

  const initStepScene = useCallback((faces) => {
    const container = stepContainerRef.current;
    if (!container) return;

    // Cleanup previous
    if (stepRafRef.current) cancelAnimationFrame(stepRafRef.current);
    if (stepRendererRef.current) stepRendererRef.current.dispose();

    const width  = container.clientWidth;
    const height = container.clientHeight;

    const scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);

    const camera   = new THREE.PerspectiveCamera(50, width / height, 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0x4477aa, 0.8));
    const dir1 = new THREE.DirectionalLight(0xffeedd, 1.0);
    dir1.position.set(1, 1, 2);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.4);
    dir2.position.set(-1, -0.5, 0.5);
    scene.add(dir2);

    // Build face meshes
    const meshes = [];
    const bbox = new THREE.Box3();

    faces.forEach((face) => {
      if (!face.vertices || !face.vertices.length) {
        meshes.push(null);
        return;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(face.vertices, 3));
      geo.setIndex(face.indices);
      geo.computeVertexNormals();
      const mat = new THREE.MeshPhongMaterial({
        color: FACE_COLORS[face.type] || FACE_COLORS.other,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        shininess: 60,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.faceId  = face.id;
      mesh.userData.faceIdx = meshes.length;
      scene.add(mesh);
      meshes.push(mesh);
      bbox.expandByObject(mesh);
    });

    // Fit camera to geometry
    if (!bbox.isEmpty()) {
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      stepCenterRef.current = center;
      stepDistRef.current   = maxDim * 2.2;
      stepZoomRef.current   = 1;
      stepRotRef.current    = { x: 0.5, y: 0.3 };
    }

    // Grid at bottom of bbox
    if (!bbox.isEmpty()) {
      const size = bbox.getSize(new THREE.Vector3());
      const center = stepCenterRef.current;
      const gridSize = Math.max(size.x, size.y) * 2.5;
      const grid = new THREE.GridHelper(gridSize, 20, 0x1a2744, 0x111b2e);
      grid.position.set(center.x, center.y, bbox.min.z - size.z * 0.05);
      scene.add(grid);
    }

    // Axis indicator (fixed bottom-left corner, updated in loop)
    const axisScene  = new THREE.Scene();
    const axisCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    axisCamera.position.set(0, 0, 3);
    const axLen = 0.8;
    [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)].forEach((d, i) => {
      axisScene.add(new THREE.ArrowHelper(d, new THREE.Vector3(0,0,0), axLen, [0xff4444, 0x44ff44, 0x4488ff][i], 0.2, 0.15));
    });

    stepRendererRef.current  = renderer;
    stepSceneRef.current     = scene;
    stepCameraRef.current    = camera;
    stepFaceMeshesRef.current = meshes;
    updateStepCamera();

    // Render loop
    const loop = () => {
      stepRafRef.current = requestAnimationFrame(loop);
      updateStepCamera();
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
      // Axis indicator inset
      const s = Math.min(width, height) * 0.12;
      renderer.setViewport(10, 10, s, s);
      renderer.setScissor(10, 10, s, s);
      renderer.setScissorTest(true);
      axisCamera.quaternion.copy(camera.quaternion);
      renderer.render(axisScene, axisCamera);
      renderer.setScissorTest(false);
    };
    loop();
  }, [updateStepCamera]);

  // Init STEP scene when faces load
  useEffect(() => {
    if (mode !== "step" || !stepFaces.length) return;
    // Small delay to ensure the div is visible after mode switch
    const t = setTimeout(() => initStepScene(stepFaces), 50);
    return () => clearTimeout(t);
  }, [mode, stepFaces, initStepScene]);

  // Cleanup STEP scene when leaving step mode
  useEffect(() => {
    if (mode !== "step") {
      if (stepRafRef.current) cancelAnimationFrame(stepRafRef.current);
      if (stepRendererRef.current) { stepRendererRef.current.dispose(); stepRendererRef.current = null; }
      stepFaceMeshesRef.current = [];
    }
  }, [mode]);

  // Update face mesh colors when selection changes
  useEffect(() => {
    stepFaceMeshesRef.current.forEach((mesh, idx) => {
      if (!mesh) return;
      const face = stepFaces[idx];
      if (!face) return;
      const sel = selectedFaceIds.has(face.id);
      mesh.material.color.setHex(sel ? FACE_SELECTED_COLOR : (FACE_COLORS[face.type] || FACE_COLORS.other));
      mesh.material.opacity  = sel ? 0.92 : 0.75;
      mesh.material.emissive.setHex(sel ? 0x331100 : 0x000000);
    });
  }, [selectedFaceIds, stepFaces]);

  // Handle window resize for STEP scene
  useEffect(() => {
    const onResize = () => {
      if (mode !== "step" || !stepRendererRef.current || !stepContainerRef.current) return;
      const { clientWidth: w, clientHeight: h } = stepContainerRef.current;
      stepRendererRef.current.setSize(w, h);
      if (stepCameraRef.current) { stepCameraRef.current.aspect = w / h; stepCameraRef.current.updateProjectionMatrix(); }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (stepRafRef.current) cancelAnimationFrame(stepRafRef.current);
    if (stepRendererRef.current) stepRendererRef.current.dispose();
  }, []);

  // ── STEP mouse handlers ──
  const handleStepMouseDown = (e) => {
    stepDragRef.current      = true;
    stepDragMovedRef.current = false;
    stepLastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleStepMouseMove = (e) => {
    if (!stepDragRef.current) return;
    const dx = e.clientX - stepLastMouseRef.current.x;
    const dy = e.clientY - stepLastMouseRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) stepDragMovedRef.current = true;
    stepRotRef.current.y += dx * 0.008;
    stepRotRef.current.x = Math.max(-1.4, Math.min(1.4, stepRotRef.current.x + dy * 0.008));
    stepLastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleStepMouseUp = (e) => {
    if (!stepDragMovedRef.current) handleStepClick(e);
    stepDragRef.current = false;
  };

  const handleStepWheel = (e) => {
    stepZoomRef.current = Math.max(0.1, Math.min(10, stepZoomRef.current * (e.deltaY < 0 ? 1.1 : 0.9)));
  };

  const handleStepClick = (e) => {
    if (!stepContainerRef.current || !stepCameraRef.current || !stepFaceMeshesRef.current.length) return;
    const rect = stepContainerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left)  / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, stepCameraRef.current);
    const meshes = stepFaceMeshesRef.current.filter(Boolean);
    const hits   = raycaster.intersectObjects(meshes);
    if (!hits.length) return;
    const faceId = hits[0].object.userData.faceId;
    setSelectedFaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(faceId)) next.delete(faceId); else next.add(faceId);
      return next;
    });
  };

  // ── STEP file upload ──
  const uploadStepFile = async (file) => {
    if (!file) return;
    setIsLoadingStep(true);
    setStepError(null);
    setStepFaces([]);
    setSelectedFaceIds(new Set());
    setGeneratedCode("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res  = await fetch(`${SERVER}/parse-step`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setStepFaces(data.faces);
    } catch (err) {
      setStepError(err.message);
    } finally {
      setIsLoadingStep(false);
    }
  };

  const handleFileInput = (e) => { uploadStepFile(e.target.files[0]); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    uploadStepFile(e.dataTransfer.files[0]);
  };

  // ── Generate Python code from selection ──
  const handleGenerateCode = () => {
    const selected = stepFaces.filter((f) => selectedFaceIds.has(f.id));
    setGeneratedCode(generatePythonCode(selected));
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const totalPts = pathData.current.reduce((s, p, i) => s + (activePaths.has(i) ? p.length : 0), 0);

  // ── Styles ──
  const S = {
    root:    { width: "100%", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono','Fira Code',monospace", background: "#080c14", color: "#c8d6e5" },
    header:  { padding: "10px 20px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #1a2744", background: "#0a0f1a" },
    dot:     { width: 8, height: 8, borderRadius: "50%", background: "#00ccff", boxShadow: "0 0 8px #00ccff88" },
    title:   { fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#e8f0ff" },
    sub:     { fontSize: 11, color: "#556688", letterSpacing: 1 },
    tab:     (active) => ({ padding: "4px 12px", borderRadius: 3, cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "inherit", border: `1px solid ${active ? "#2a5588" : "transparent"}`, background: active ? "#111a2e" : "transparent", color: active ? "#00ccff" : "#445566", transition: "all 0.15s" }),
    sidebar: { width: 240, padding: 16, borderRight: "1px solid #1a2744", background: "#0c111d", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", fontSize: 12 },
    section: { fontSize: 10, fontWeight: 700, color: "#556688", letterSpacing: 1.5, marginBottom: 10 },
    row:     (active) => ({ padding: "8px 10px", marginBottom: 4, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: active ? "#111a2e" : "transparent", border: `1px solid ${active ? "#1a3355" : "transparent"}`, transition: "all 0.15s" }),
    swatch:  (active, color) => ({ width: 10, height: 10, borderRadius: 2, background: active ? color : "#222", border: `1px solid ${color}`, transition: "all 0.15s", flexShrink: 0 }),
    label:   (active) => ({ color: active ? "#e8f0ff" : "#445566" }),
    btn:     (variant = "default") => ({
      width: "100%", padding: "8px 0", border: `1px solid ${variant === "primary" ? "#00ccff" : "#2a5588"}`,
      borderRadius: 4, background: variant === "primary" ? "#0d2233" : "#0d1b33",
      color: variant === "primary" ? "#00ccff" : "#7aabcc", cursor: "pointer",
      fontSize: 11, fontFamily: "inherit", letterSpacing: 1, transition: "all 0.15s",
    }),
  };

  const faceTypeHex = (type) => "#" + (FACE_COLORS[type] || FACE_COLORS.other).toString(16).padStart(6, "0");

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.dot} />
        <span style={S.title}>UTDE</span>
        <span style={S.sub}>UNIVERSAL TOOLPATH DESIGN ENVIRONMENT</span>
        <div style={{ width: 1, height: 20, background: "#1a2744" }} />
        <button style={S.tab(mode === "toolpath")} onClick={() => setMode("toolpath")}>TOOLPATHS</button>
        <button style={S.tab(mode === "step")}      onClick={() => setMode("step")}>STEP IMPORT</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "#334466" }}>v0.1.0</span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Toolpath sidebar ── */}
        {mode === "toolpath" && (
          <div style={S.sidebar}>
            <div>
              <div style={S.section}>TOOLPATHS</div>
              {pathLabels.map((label, i) => (
                <div key={i} style={S.row(activePaths.has(i))} onClick={() => togglePath(i)}>
                  <div style={S.swatch(activePaths.has(i), pathColors[i])} />
                  <span style={S.label(activePaths.has(i))}>{label}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={S.section}>DISPLAY</div>
              <div style={S.row(showNormals)} onClick={() => setShowNormals(!showNormals)}>
                <div style={S.swatch(showNormals, "#ffcc00")} />
                <span style={S.label(showNormals)}>Tool Normals</span>
              </div>
            </div>
            <div>
              <div style={S.section}>ANIMATION</div>
              <button style={{ ...S.btn(), color: isAnimating ? "#445566" : "#00ccff", cursor: isAnimating ? "default" : "pointer" }} onClick={startAnimation} disabled={isAnimating}>
                {isAnimating ? "SIMULATING..." : "▶ PLAY TOOLPATH"}
              </button>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={0} max={100} value={Math.round(animProgress * 100)}
                  onChange={(e) => { setAnimProgress(e.target.value / 100); setIsAnimating(false); }}
                  style={{ flex: 1, accentColor: "#00ccff" }} />
                <span style={{ fontSize: 10, color: "#556688", minWidth: 36 }}>{Math.round(animProgress * 100)}%</span>
              </div>
            </div>
            <div style={{ marginTop: "auto", fontSize: 10, color: "#334466", lineHeight: 1.6 }}>
              <div style={{ borderTop: "1px solid #1a2744", paddingTop: 12, marginTop: 8 }}>
                <div>Points: <span style={{ color: "#88aacc" }}>{totalPts.toLocaleString()}</span></div>
                <div>Machine: <span style={{ color: "#88aacc" }}>5-Axis AC</span></div>
                <div>Process: <span style={{ color: "#88aacc" }}>DED Weld</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP sidebar ── */}
        {mode === "step" && (
          <div style={S.sidebar}>
            {/* Upload */}
            <div>
              <div style={S.section}>STEP FILE</div>
              <label
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  padding: "16px 8px", borderRadius: 4, cursor: "pointer", textAlign: "center",
                  border: `1px dashed ${isDragOver ? "#00ccff" : "#2a5588"}`,
                  background: isDragOver ? "#0d2233" : "transparent",
                  color: isDragOver ? "#00ccff" : "#445566",
                  fontSize: 10, lineHeight: 1.8, transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 18, marginBottom: 4 }}>⬆</span>
                <span>Drop .step / .stp</span>
                <span>or click to browse</span>
                <input type="file" accept=".step,.stp" onChange={handleFileInput} style={{ display: "none" }} />
              </label>
              {isLoadingStep && (
                <div style={{ marginTop: 8, fontSize: 10, color: "#00ccff", textAlign: "center" }}>Parsing STEP file...</div>
              )}
              {stepError && (
                <div style={{ marginTop: 8, fontSize: 10, color: "#ff6644", lineHeight: 1.5 }}>
                  Error: {stepError}
                  {stepError.includes("pythonocc") && (
                    <div style={{ marginTop: 4, color: "#556688" }}>
                      Start the server:<br />
                      <code style={{ color: "#88aacc" }}>python step_server.py</code>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Face list */}
            {stepFaces.length > 0 && (
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ ...S.section, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>FACES ({stepFaces.length})</span>
                  {selectedFaceIds.size > 0 && (
                    <span style={{ color: "#ff8800" }}>{selectedFaceIds.size} selected</span>
                  )}
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {stepFaces.map((face, i) => {
                    const sel = selectedFaceIds.has(face.id);
                    return (
                      <div key={face.id} style={S.row(sel)}
                        onClick={() => setSelectedFaceIds((prev) => { const n = new Set(prev); if (n.has(face.id)) n.delete(face.id); else n.add(face.id); return n; })}>
                        <div style={{ ...S.swatch(sel, faceTypeHex(face.type)), borderRadius: "50%" }} />
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={S.label(sel)}>Face {face.id}</div>
                          <div style={{ fontSize: 9, color: sel ? "#ff8800" : "#334466", marginTop: 1 }}>{face.type}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selection controls */}
            {stepFaces.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button style={S.btn()} onClick={() => setSelectedFaceIds(new Set(stepFaces.map((f) => f.id)))}>Select All</button>
                <button style={S.btn()} onClick={() => setSelectedFaceIds(new Set())}>Deselect All</button>
                <button
                  style={{ ...S.btn("primary"), opacity: selectedFaceIds.size ? 1 : 0.4, cursor: selectedFaceIds.size ? "pointer" : "default" }}
                  onClick={handleGenerateCode}
                  disabled={!selectedFaceIds.size}
                >
                  GENERATE PYTHON ↓
                </button>
              </div>
            )}

            {/* Legend */}
            {stepFaces.length > 0 && (
              <div style={{ fontSize: 9, color: "#334466", lineHeight: 1.8 }}>
                <div style={{ borderTop: "1px solid #1a2744", paddingTop: 8, marginTop: 4 }}>
                  {Object.entries(FACE_COLORS).filter(([k]) => k !== "other").map(([type, hex]) => (
                    <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#" + hex.toString(16).padStart(6, "0") }} />
                      <span style={{ color: "#445566" }}>{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Viewport + code panel ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* 3D viewports */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {/* Toolpath viewport */}
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              style={{ position: "absolute", inset: 0, cursor: isDragging.current ? "grabbing" : "grab", display: mode === "toolpath" ? "block" : "none" }}
            />

            {/* STEP viewport */}
            <div style={{ position: "absolute", inset: 0, display: mode === "step" ? "flex" : "none", flexDirection: "column" }}>
              {!stepFaces.length && !isLoadingStep && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#2a4466", fontSize: 12, gap: 8 }}>
                  <div style={{ fontSize: 32 }}>◈</div>
                  <div>Upload a STEP file to visualize surfaces</div>
                  <div style={{ fontSize: 10, color: "#1a2e44" }}>
                    Requires <code style={{ color: "#334466" }}>python step_server.py</code> running on port 5174
                  </div>
                </div>
              )}
              <div
                ref={stepContainerRef}
                onMouseDown={handleStepMouseDown}
                onMouseMove={handleStepMouseMove}
                onMouseUp={handleStepMouseUp}
                onMouseLeave={() => { stepDragRef.current = false; }}
                onWheel={handleStepWheel}
                style={{ flex: 1, cursor: stepDragRef.current ? "grabbing" : "grab", display: stepFaces.length ? "block" : "none" }}
              />
            </div>
          </div>

          {/* Generated code panel */}
          {mode === "step" && generatedCode && (
            <div style={{ borderTop: "1px solid #1a2744", background: "#080c14", maxHeight: 220, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #111b2e" }}>
                <span style={{ fontSize: 10, color: "#556688", letterSpacing: 1.5, fontWeight: 700 }}>GENERATED PYTHON</span>
                <button
                  onClick={handleCopyCode}
                  style={{ ...S.btn("primary"), width: "auto", padding: "4px 14px", fontSize: 10 }}
                >
                  {codeCopied ? "COPIED ✓" : "COPY"}
                </button>
              </div>
              <pre style={{ flex: 1, overflowY: "auto", margin: 0, padding: "12px 16px", fontSize: 11, lineHeight: 1.6, color: "#88bbcc", fontFamily: "inherit" }}>
                {generatedCode}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
