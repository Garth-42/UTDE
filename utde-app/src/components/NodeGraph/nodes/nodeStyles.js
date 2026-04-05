/** Shared visual tokens for all node components */
export const NODE_COLORS = {
  geometry:       "#16a34a",
  strategy:       "#6355e0",
  orient:         "#d97706",
  post_processor: "#44445a",
};

export const nodeWrap = (color, selected) => ({
  background: "#f4f4fa",
  border: `1.5px solid ${selected ? color : "#d0d0df"}`,
  borderRadius: 8,
  minWidth: 160,
  boxShadow: selected ? `0 0 0 2px ${color}33` : "0 1px 4px rgba(0,0,0,0.08)",
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  fontSize: 11,
  color: "#1a1a2e",
  cursor: "default",
  transition: "border-color 0.15s, box-shadow 0.15s",
});

export const nodeHeader = (color) => ({
  background: color,
  borderRadius: "6px 6px 0 0",
  padding: "5px 10px",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  display: "flex",
  alignItems: "center",
  gap: 6,
});

export const nodeBody = {
  padding: "8px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

export const paramRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 10,
  gap: 8,
};

export const paramKey   = { color: "#66667a" };
export const paramValue = { color: "#1a1a2e", fontWeight: 500 };
