import { IconStar as Star } from "@tabler/icons-react";

export function ClayStarRating({
  value,
  onChange,
  size = "md",
  readOnly = false,
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
}) {
  const dims = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" }[size];
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={`transition-transform ${readOnly ? "cursor-default" : "hover:scale-110"}`}
          aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={`${dims} ${n <= value ? "fill-[var(--sky-deep)] text-[var(--sky-deep)]" : "fill-none text-foreground/25"}`}
          />
        </button>
      ))}
    </div>
  );
}