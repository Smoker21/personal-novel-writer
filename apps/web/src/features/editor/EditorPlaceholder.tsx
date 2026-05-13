import { Link, useParams } from "react-router-dom";

export function EditorPlaceholder() {
  const { hash } = useParams<{ hash: string }>();
  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link to="/" className="text-sm text-blue-600 underline">
        ← 返回首頁
      </Link>
      <h1 className="text-2xl font-semibold mt-4">章節編輯器</h1>
      <p className="text-sm text-gray-500 mt-2">專案：{hash}</p>
      <div className="mt-8 p-8 border-2 border-dashed rounded text-center text-gray-400">
        編輯器將在 M1-C 啟用。本頁為佔位元件。
      </div>
    </div>
  );
}
