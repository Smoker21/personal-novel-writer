import { useState } from "react";

interface PortraitCardProps {
  projectHash: string;
  slug: string;
  scope: "default" | "chapter";
  chapterNumber?: number;
  imgPath: string | null;
  onUploaded: (path: string) => void;
  onDeleted: () => void;
  onExtracted: () => void;
}

function PortraitCard({
  projectHash,
  slug,
  scope,
  chapterNumber,
  imgPath,
  onUploaded,
  onDeleted,
  onExtracted,
}: PortraitCardProps) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const handleFileChange = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("只接受 JPG / PNG / WebP 格式");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("圖片不能超過 10 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("scope", scope);
      if (scope === "chapter" && chapterNumber !== undefined) {
        form.append("chapterNumber", String(chapterNumber));
      }
      const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/portraits`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const data = (await res.json()) as { path: string };
        onUploaded(data.path);
      } else {
        alert("上傳失敗");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/portraits/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, chapterNumber: chapterNumber ?? null }),
      });
      if (res.ok) {
        onExtracted();
      } else {
        const err = (await res.json()) as { message?: string };
        alert(`解析失敗：${err.message ?? "未知錯誤"}`);
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("確定刪除這張圖片？")) return;
    const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/portraits`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, chapterNumber: chapterNumber ?? null }),
    });
    if (res.ok) onDeleted();
  };

  const label = scope === "default" ? "預設圖" : `第 ${chapterNumber} 章版本`;

  return (
    <div className="rounded-lg border border-neutral-700 p-3 space-y-2">
      <p className="text-xs font-medium text-neutral-300">{label}</p>
      {imgPath ? (
        <div className="relative group">
          <img
            src={`/api/projects/${projectHash}/file?path=${encodeURIComponent(imgPath ?? "")}`}
            alt={label}
            onClick={() => setLightbox(true)}
            className="rounded w-28 h-28 object-cover cursor-zoom-in"
          />
          <button
            type="button"
            onClick={handleDelete}
            className="absolute top-1 right-1 hidden group-hover:flex rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
          >
            刪
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center rounded border border-dashed border-neutral-600 px-4 py-3 text-xs text-neutral-400 hover:border-neutral-400 cursor-pointer w-28 h-28">
          {uploading ? "上傳中…" : "上傳圖片"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFileChange(f);
            }}
          />
        </label>
      )}
      {imgPath && (
        <button
          type="button"
          onClick={handleExtract}
          disabled={extracting}
          className="rounded border border-indigo-700 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-40 transition-colors"
        >
          {extracting ? "解析中…" : "從圖解析"}
        </button>
      )}

      {/* Lightbox */}
      {lightbox && imgPath && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <img
            src={`/api/projects/${projectHash}/file?path=${encodeURIComponent(imgPath ?? "")}`}
            alt={label}
            className="max-w-full max-h-full rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

interface Props {
  projectHash: string;
  slug: string;
  defaultPortraitPath: string | null;
  onRefresh: () => void;
}

export function PortraitSection({ projectHash, slug, defaultPortraitPath, onRefresh }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
        外貌（圖片）
      </h3>
      <PortraitCard
        projectHash={projectHash}
        slug={slug}
        scope="default"
        imgPath={defaultPortraitPath}
        onUploaded={onRefresh}
        onDeleted={onRefresh}
        onExtracted={onRefresh}
      />
    </div>
  );
}
