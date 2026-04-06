import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";

export const utdeTheme = createTheme({
  theme: "dark",
  settings: {
    background:       "#1a1a2e",
    foreground:       "#e0e0f0",
    caret:            "#6355e0",
    selection:        "rgba(99,85,224,0.25)",
    selectionMatch:   "rgba(99,85,224,0.15)",
    lineHighlight:    "rgba(255,255,255,0.04)",
    gutterBackground: "#14142a",
    gutterForeground: "#44446a",
    gutterBorder:     "#2a2a4a",
  },
  styles: [
    { tag: t.keyword,           color: "#6355e0", fontWeight: "bold" },
    { tag: t.definitionKeyword, color: "#6355e0", fontWeight: "bold" },
    { tag: t.string,            color: "#16a34a" },
    { tag: t.number,            color: "#d97706" },
    { tag: t.comment,           color: "#5a5a7a", fontStyle: "italic" },
    { tag: t.className,         color: "#60a5fa" },
    { tag: t.function(t.variableName), color: "#a78bfa" },
    { tag: t.variableName,      color: "#e0e0f0" },
    { tag: t.operator,          color: "#cc3377" },
    { tag: t.punctuation,       color: "#9090aa" },
    { tag: t.bool,              color: "#d97706" },
    { tag: t.null,              color: "#d97706" },
    { tag: t.typeName,          color: "#60a5fa" },
    { tag: t.propertyName,      color: "#a78bfa" },
  ],
});
