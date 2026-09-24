import { IconFileText as FileText, IconExternalLink as ExternalLink, IconDownload as Download, IconX as X } from "@tabler/icons-react";

export function PdfPreviewModal({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <div
      className="animate-in fade-in fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm duration-200 sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-in zoom-in-95 clay flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden p-2 duration-200 sm:p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="clay-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
              <FileText className="h-4 w-4 text-foreground/50" />
            </div>
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href={url}
              download={name}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <iframe title={name} src={url} className="clay-inset h-full w-full flex-1 rounded-2xl bg-white" />
      </div>
    </div>
  );
}