// Shared inline style tokens — stlTexturizer-inspired light theme
export const S = {
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: "#66667a", letterSpacing: 1.5,
  },

  row: (active) => ({
    padding: "6px 8px", borderRadius: 6,
    background: active ? "#e8e8f4" : "transparent",
    border: `1px solid ${active ? "#d0d0df" : "transparent"}`,
    transition: "all 0.12s",
  }),

  btn: {
    padding: "7px 0", border: "1px solid #d0d0df", borderRadius: 6,
    background: "#eaeaf2", color: "#44445a", cursor: "pointer",
    fontSize: 11, fontFamily: "inherit", letterSpacing: 0.5,
    transition: "all 0.15s", width: "100%",
  },

  primaryBtn: {
    padding: "7px 14px", border: "1px solid #6355e0", borderRadius: 6,
    background: "rgba(99,85,224,0.08)", color: "#6355e0", cursor: "pointer",
    fontSize: 11, fontFamily: "inherit", letterSpacing: 0.5,
    transition: "all 0.15s",
  },

  iconBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: "#66667a", fontSize: 13, padding: "2px 4px",
    fontFamily: "inherit", lineHeight: 1,
  },

  chipBtn: {
    padding: "3px 8px", border: "1px solid #d0d0df", borderRadius: 10,
    background: "transparent", color: "#66667a", cursor: "pointer",
    fontSize: 9, fontFamily: "inherit", letterSpacing: 0.5,
    transition: "all 0.12s",
  },

  select: {
    width: "100%", background: "#eaeaf2", border: "1px solid #d0d0df",
    borderRadius: 6, color: "#1a1a2e", padding: "6px 8px",
    fontSize: 11, fontFamily: "inherit", cursor: "pointer",
  },

  card: {
    background: "#eaeaf2", border: "1px solid #d0d0df",
    borderRadius: 8, padding: "10px 12px",
  },
};
