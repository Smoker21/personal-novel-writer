import { describe, expect, it, beforeEach } from "vitest";
import { useEditorStore } from "./editor-store.js";

describe("editor-store", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useEditorStore.setState({ projectHash: null });
  });

  it("starts in loading state", () => {
    expect(useEditorStore.getState().state.kind).toBe("loading");
  });

  it("setChapter sets context", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "x",
      fileTitle: "x",
      baseMtime: "2026-01-01T00:00:00Z",
      baseContent: "content",
    });
    expect(useEditorStore.getState().chapter?.number).toBe(1);
  });

  it("markDirty transitions to browser-only", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "x",
      fileTitle: "x",
      baseMtime: "x",
      baseContent: "x",
    });
    useEditorStore.getState().markDirty(10, 1000);
    const s = useEditorStore.getState().state;
    expect(s.kind).toBe("browser-only");
    if (s.kind === "browser-only") expect(s.lastAutoSaveAt).toBe(1000);
  });

  it("markClean updates baseMtime and resets state", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "x",
      fileTitle: "x",
      baseMtime: "old",
      baseContent: "old",
    });
    useEditorStore.getState().markClean("new", "new content", "new-title");
    const { chapter, state } = useEditorStore.getState();
    expect(state.kind).toBe("clean");
    expect(chapter?.baseMtime).toBe("new");
    expect(chapter?.baseContent).toBe("new content");
    expect(chapter?.fileTitle).toBe("new-title");
  });

  it("setTitle updates only title not fileTitle", () => {
    useEditorStore.getState().setChapter({
      number: 1,
      title: "old",
      fileTitle: "old",
      baseMtime: "x",
      baseContent: "x",
    });
    useEditorStore.getState().setTitle("new");
    const c = useEditorStore.getState().chapter;
    expect(c?.title).toBe("new");
    expect(c?.fileTitle).toBe("old");
  });
});
