import { Crown, ImageOff, Pencil, Skull, Trash2, User, Users } from "lucide-react";
import type { ReactNode } from "react";

export interface PortraitCardData {
  slug: string;
  name: string;
  role: string | null;
  portraitDefault: string | null;
}

export function PortraitGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
    >
      {children}
    </div>
  );
}

function roleIcon(role: string | null) {
  switch (role) {
    case "主角":
      return Crown;
    case "配角":
      return User;
    case "反派":
      return Skull;
    case "重要路人":
      return Users;
    default:
      return ImageOff;
  }
}

interface BrowseCardProps {
  projectHash: string;
  data: PortraitCardData;
  variant: "browse";
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

interface SelectCardProps {
  projectHash: string;
  data: PortraitCardData;
  variant: "select";
  selected: boolean;
  onClick: () => void;
}

export type PortraitCardProps = BrowseCardProps | SelectCardProps;

export function PortraitCard(props: PortraitCardProps) {
  const { projectHash, data, variant, onClick } = props;
  const Icon = roleIcon(data.role);
  const imageSrc = data.portraitDefault
    ? `/api/projects/${projectHash}/file?path=${encodeURIComponent(data.portraitDefault)}`
    : null;
  const selected = variant === "select" && props.selected;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col rounded-lg border bg-neutral-900 text-left transition-all ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-500/40"
          : "border-neutral-700 hover:border-neutral-500 hover:-translate-y-0.5"
      }`}
      aria-pressed={variant === "select" ? selected : undefined}
      data-testid={`portrait-card-${data.slug}`}
    >
      <div
        className="relative w-full overflow-hidden rounded-t-lg bg-neutral-800"
        style={{ aspectRatio: "3 / 4" }}
      >
        {imageSrc ? (
          <img src={imageSrc} alt={data.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600">
            <Icon className="h-12 w-12" />
          </div>
        )}
        {variant === "select" && selected && (
          <div className="absolute right-2 top-2 rounded-full bg-indigo-500 px-2 py-0.5 text-xs font-medium text-white">
            ✓
          </div>
        )}
        {variant === "browse" && (props.onEdit || props.onDelete) && (
          <BrowseActions onEdit={props.onEdit} onDelete={props.onDelete} />
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        <div className="truncate text-sm font-medium text-neutral-100">{data.name}</div>
        <div className="truncate text-xs text-neutral-500">{data.role ?? "（未設定定位）"}</div>
      </div>
    </button>
  );
}

function BrowseActions({
  onEdit,
  onDelete,
}: {
  onEdit: (() => void) | undefined;
  onDelete: (() => void) | undefined;
}) {
  return (
    <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
      {onEdit && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onEdit();
            }
          }}
          className="rounded bg-black/60 p-1 text-white hover:bg-black/80"
          title="編輯"
          aria-label="編輯角色"
        >
          <Pencil className="h-3.5 w-3.5" />
        </span>
      )}
      {onDelete && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onDelete();
            }
          }}
          className="rounded bg-black/60 p-1 text-red-300 hover:bg-red-700"
          title="刪除"
          aria-label="刪除角色"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

export function AddPortraitCard({
  onClick,
  label = "+ 新增角色",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-lg border border-dashed border-neutral-700 bg-neutral-900/50 text-neutral-400 transition-all hover:border-neutral-500 hover:text-neutral-200"
    >
      <div className="flex w-full items-center justify-center" style={{ aspectRatio: "3 / 4" }}>
        <span className="text-4xl font-thin">+</span>
      </div>
      <div className="px-2.5 py-2 text-sm">{label}</div>
    </button>
  );
}
