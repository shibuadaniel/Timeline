import { useEffect, useMemo, useRef, useState } from "react";

type SearchableSelectProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
};

export function SearchableSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const displayLabel = value === "all" ? "All" : value;

  return (
    <div className="searchable-select" ref={wrapperRef}>
      <label htmlFor={id}>{label}</label>
      <div className="searchable-select-inner">
        <input
          id={id}
          type="search"
          className="searchable-select-input"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          role="combobox"
          placeholder="Search…"
          value={open ? query : displayLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery(value === "all" ? "" : value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <button
          type="button"
          className="searchable-select-chevron"
          aria-label={open ? "Close list" : "Open list"}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((wasOpen) => {
              const next = !wasOpen;
              if (next) setQuery(value === "all" ? "" : value);
              return next;
            });
          }}
        >
          ▾
        </button>
      </div>
      {open && !disabled ? (
        <ul
          id={`${id}-listbox`}
          className="searchable-select-list"
          role="listbox"
        >
          <li role="option">
            <button
              type="button"
              className="searchable-select-option"
              onClick={() => {
                onChange("all");
                setOpen(false);
                setQuery("");
              }}
            >
              All
            </button>
          </li>
          {filtered.length === 0 ? (
            <li className="searchable-select-empty muted" role="presentation">
              No matches
            </li>
          ) : (
            filtered.map((o) => (
              <li key={o} role="option">
                <button
                  type="button"
                  className="searchable-select-option"
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {o}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
