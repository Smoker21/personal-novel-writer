import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorStatusIndicator } from "./EditorStatusIndicator.js";

describe("EditorStatusIndicator", () => {
  it("renders loading", () => {
    render(<EditorStatusIndicator state={{ kind: "loading" }} />);
    expect(screen.getByText(/載入中/)).toBeInTheDocument();
  });
  it("renders clean (green)", () => {
    render(<EditorStatusIndicator state={{ kind: "clean" }} />);
    expect(screen.getByText(/已儲存/)).toBeInTheDocument();
  });
  it("renders browser-only (yellow)", () => {
    render(
      <EditorStatusIndicator
        state={{ kind: "browser-only", lastAutoSaveAt: Date.now() }}
      />,
    );
    expect(screen.getByText(/編輯中/)).toBeInTheDocument();
  });
  it("renders save-error (red) with reason", () => {
    render(
      <EditorStatusIndicator
        state={{ kind: "save-error", reason: "network", retryCount: 1 }}
      />,
    );
    expect(screen.getByText(/儲存失敗/)).toBeInTheDocument();
    expect(screen.getByText(/network/)).toBeInTheDocument();
  });
});
