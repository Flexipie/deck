import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type KeyboardEvent,
} from "react";

export interface BranchPickerHandle {
  open: () => void;
}

interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export const BranchPicker = forwardRef<BranchPickerHandle, Props>(function BranchPicker(
  { label, value, options, onChange },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoverIdx, setHoverIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true);
      setQuery("");
    },
  }));

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setHoverIdx(0);
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const filtered = options.filter((o) => fuzzyMatch(query, o));

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[hoverIdx];
      if (pick) commit(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="deck-picker" ref={rootRef}>
      <button
        type="button"
        className="deck-picker-button"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="deck-picker-label">{label}</span>
        <span className="deck-picker-value">{value || "—"}</span>
        <span className="deck-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="deck-picker-popover" role="dialog">
          <input
            ref={inputRef}
            className="deck-picker-search"
            placeholder="Search branches..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHoverIdx(0);
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="deck-picker-list" role="listbox">
            {filtered.length === 0 && (
              <li className="deck-picker-empty">No matches</li>
            )}
            {filtered.map((opt, i) => (
              <li
                key={opt}
                role="option"
                aria-selected={i === hoverIdx}
                className={`deck-picker-item${i === hoverIdx ? " is-hover" : ""}${opt === value ? " is-selected" : ""}`}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(opt);
                }}
              >
                {opt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
