import { Navigate, createBrowserRouter } from "react-router-dom";
import { ChapterEditorPage } from "./features/editor/ChapterEditorPage";
import { HomePage } from "./features/home/HomePage";
import { SettingsPage } from "./features/settings/SettingsPage";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/editor/:hash", element: <ChapterEditorPage /> },
  { path: "/editor/created", element: <Navigate to="/" replace /> },
]);
