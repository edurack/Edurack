import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

const options = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "system" as const, label: "System", icon: Monitor },
  { value: "dark" as const, label: "Dark", icon: Moon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="clay-inset inline-flex gap-1 rounded-full p-1">
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
              active
                ? "clay-btn text-white"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}