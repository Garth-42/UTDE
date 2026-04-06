import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const editorTheme = EditorView.theme({
  "&": {
    color:           "#e0e0f0",
    backgroundColor: "#1a1a2e",
    height:          "100%",
  },
  ".cm-content": {
    caretColor: "#6355e0",
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize:   "12px",
    lineHeight: "1.7",
  },
  ".cm-cursor": {
    borderLeftColor: "#6355e0",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(99,85,224,0.25)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  ".cm-gutters": {
    backgroundColor: "#14142a",
    color:           "#44446a",
    border:          "none",
    borderRight:     "1px solid #2a2a4a",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(99,85,224,0.12)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 4px",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
}, { dark: true });

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword,                 color: "#6355e0", fontWeight: "bold" },
  { tag: t.definitionKeyword,       color: "#6355e0", fontWeight: "bold" },
  { tag: t.controlKeyword,          color: "#6355e0", fontWeight: "bold" },
  { tag: t.string,                  color: "#16a34a" },
  { tag: t.number,                  color: "#d97706" },
  { tag: t.comment,                 color: "#5a5a7a", fontStyle: "italic" },
  { tag: t.className,               color: "#60a5fa" },
  { tag: t.function(t.variableName), color: "#a78bfa" },
  { tag: t.variableName,            color: "#e0e0f0" },
  { tag: t.operator,                color: "#cc3377" },
  { tag: t.punctuation,             color: "#9090aa" },
  { tag: t.bool,                    color: "#d97706" },
  { tag: t.null,                    color: "#d97706" },
  { tag: t.typeName,                color: "#60a5fa" },
  { tag: t.propertyName,            color: "#a78bfa" },
]);

export const utdeTheme = [editorTheme, syntaxHighlighting(highlightStyle)];
