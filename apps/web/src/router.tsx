import { createBrowserRouter } from "react-router-dom";
import { EditorPlaceholder } from "./features/editor/EditorPlaceholder.js";
import { HomePage } from "./features/home/HomePage.js";
import { SettingsPage } from "./features/settings/SettingsPage.js";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/editor/:hash", element: <EditorPlaceholder /> },
  { path: "/editor/created", element: <EditorPlaceholder /> },
]);
