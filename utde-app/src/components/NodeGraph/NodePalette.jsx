import { useState, useCallback } from "react";
import { NODE_REGISTRY } from "../../store/graphStore";
import { NODE_COLORS } from "./nodes/nodeStyles";

const SECTIONS = ["Geometry", "Strategy", "Orientation", "Post"];

function groupBySection(registry) {
  const groups = {};
  SECTIONS.forEach((s) => { groups[s] = []; });
  registry.forEach((item) => {
    if (groups[item.section]) groups[item.section].push(item);
  });
  return groups;
}

const GROUPS = groupBySection(NODE_REGISTRY);

export default function NodePalette({ onAddNode, onDragStart }) {
  const [openSection, setOpenSection] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const toggleSection = useCallback((section) => {
    setOpenSection((prev) => (prev === section ? null : section));
  }, []);

  const handleItemClick = useCallback((item) => {
    onAddNode(item.type, item.params ?? {}, null);
    setOpenSection(null);
  }, [onAddNode]);

  const handleDragStart = useCallback((event, item) => {
    event.dataTransfer.setData(
      "application/utde-node",
      JSON.stringify({ type: item.type, params: item.params ?? {} })
    );
    event.dataTransfer.effectAllowed = "copy";
    if (onDragStart) onDragStart(event, item.type, item.params ?? {});
    // Mark dragging so the overlay becomes pointer-events:none — this lets
    // dragover/drop events reach the React Flow canvas underneath.
    // Do NOT close the dropdown here — unmounting the dragged element mid-drag
    // causes browsers to cancel the drag operation.
    setIsDragging(true);
  }, [onDragStart]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setOpenSection(null);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        background: "#12122a",
        borderBottom: "1px solid #2a2a4a",
        flexShrink: 0,
        position: "relative",
        zIndex: 50,
        height: 36,
        userSelect: "none",
      }}
    >
      <span style={{
        fontSize: 9, fontWeight: 700, color: "#6355e0",
        letterSpacing: 1.5, marginRight: 8, whiteSpace: "nowrap",
      }}>
        NODES
      </span>

      {SECTIONS.map((section) => {
        const items = GROUPS[section] ?? [];
        const isOpen = openSection === section;

        return (
          <div key={section} style={{ position: "relative" }}>
            {/* Section button */}
            <button
              onClick={() => toggleSection(section)}
              style={{
                background: isOpen ? "rgba(99,85,224,0.2)" : "transparent",
                border: `1px solid ${isOpen ? "#6355e0" : "#3a3a5e"}`,
                borderRadius: 5,
                color: isOpen ? "#a898f8" : "#b0b0cc",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 600,
                letterSpacing: 0.5,
                padding: "3px 10px",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!isOpen) {
                  e.currentTarget.style.borderColor = "#6355e0";
                  e.currentTarget.style.color = "#a898f8";
                }
              }}
              onMouseLeave={(e) => {
                if (!isOpen) {
                  e.currentTarget.style.borderColor = "#3a3a5e";
                  e.currentTarget.style.color = "#b0b0cc";
                }
              }}
            >
              {section} <span style={{ opacity: 0.7, fontSize: 8 }}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {/* Dropdown */}
            {isOpen && (
              <>
                {/* Click-away overlay — pointer-events disabled during drag so
                    dragover/drop reach the React Flow canvas underneath */}
                <div
                  style={{
                    position: "fixed", inset: 0, zIndex: 49,
                    pointerEvents: isDragging ? "none" : "auto",
                  }}
                  onClick={() => setOpenSection(null)}
                />
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 100,
                  background: "#1a1a2e",
                  border: "1px solid #3a3a5e",
                  borderRadius: 8,
                  padding: "4px 0",
                  minWidth: 170,
                  boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
                }}>
                  <div style={{
                    padding: "3px 12px 4px",
                    fontSize: 9, color: "#6355e0",
                    letterSpacing: 1.2, fontWeight: 700,
                    borderBottom: "1px solid #2a2a4a",
                    marginBottom: 2,
                  }}>
                    {section.toUpperCase()}
                  </div>
                  {items.map((item) => (
                    <div
                      key={`${item.type}_${item.label}`}
                      draggable
                      onClick={() => handleItemClick(item)}
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragEnd={handleDragEnd}
                      style={{
                        padding: "6px 14px",
                        cursor: "grab",
                        color: "#e0e0f0",
                        fontSize: 11,
                        borderLeft: `2px solid ${NODE_COLORS[item.type] ?? "#9090aa"}`,
                        marginLeft: 8,
                        borderRadius: 2,
                        transition: "background 0.1s",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(99,85,224,0.15)";
                        e.currentTarget.style.cursor = "grab";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{
                        display: "inline-block",
                        width: 6, height: 6,
                        borderRadius: "50%",
                        background: NODE_COLORS[item.type] ?? "#9090aa",
                        flexShrink: 0,
                      }} />
                      {item.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Hint text */}
      <span style={{
        marginLeft: "auto",
        fontSize: 9,
        color: "#3a3a5e",
        whiteSpace: "nowrap",
      }}>
        click to add · drag to place
      </span>
    </div>
  );
}
