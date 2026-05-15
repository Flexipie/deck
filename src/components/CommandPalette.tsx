import { useEffect } from "react";
import { Command as CmdkRoot } from "cmdk";
import { useActivePanel } from "../contexts/ActivePanel";
import {
  useCommandRegistry,
  useCommands,
} from "../contexts/CommandRegistry";

export function CommandPalette() {
  const { isOpen, open, close, toggle } = useCommandRegistry();
  const { activePanel } = useActivePanel();
  const commands = useCommands(activePanel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, close, isOpen]);

  if (!isOpen) {
    return (
      <button
        type="button"
        className="deck-palette-hidden-trigger"
        aria-label="Open command palette"
        onClick={open}
        tabIndex={-1}
      />
    );
  }

  return (
    <div className="deck-palette-backdrop" onClick={close}>
      <div className="deck-palette" onClick={(e) => e.stopPropagation()}>
        <CmdkRoot label="Deck commands">
          <CmdkRoot.Input
            className="deck-palette-input"
            placeholder="Type a command…"
            autoFocus
          />
          <CmdkRoot.List className="deck-palette-list">
            <CmdkRoot.Empty className="deck-palette-empty">No matches.</CmdkRoot.Empty>
            {commands.map((c) => (
              <CmdkRoot.Item
                key={c.id}
                value={`${c.id} ${c.label}`}
                className="deck-palette-item"
                onSelect={async () => {
                  close();
                  try {
                    await c.execute();
                  } catch (err) {
                    console.error("command failed", c.id, err);
                  }
                }}
              >
                <span className="deck-palette-label">{c.label}</span>
                {c.hint && <span className="deck-palette-hint">{c.hint}</span>}
              </CmdkRoot.Item>
            ))}
          </CmdkRoot.List>
        </CmdkRoot>
      </div>
    </div>
  );
}
