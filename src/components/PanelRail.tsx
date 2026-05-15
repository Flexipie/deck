import { useActivePanel, type PanelId } from "../contexts/ActivePanel";

interface RailItem {
  id: PanelId;
  label: string;
  glyph: string;
}

const RAIL_ITEMS: RailItem[] = [
  { id: "diff", label: "Diff", glyph: "≋" },
];

export function PanelRail() {
  const { activePanel, setActivePanel } = useActivePanel();
  return (
    <nav className="deck-rail" aria-label="Panels">
      {RAIL_ITEMS.map((item) => {
        const active = activePanel === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`deck-rail-button${active ? " is-active" : ""}`}
            aria-label={item.label}
            aria-pressed={active}
            onClick={() => setActivePanel(item.id)}
          >
            <span className="deck-rail-glyph" aria-hidden="true">
              {item.glyph}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
