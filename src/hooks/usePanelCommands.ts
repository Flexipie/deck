import { useMemo } from "react";
import {
  useRegisterCommands,
  type Command,
} from "../contexts/CommandRegistry";
import type { PanelId } from "../contexts/ActivePanel";

export interface PanelCommand {
  id: string;
  label: string;
  hint?: string;
  execute: () => void | Promise<void>;
}

export function usePanelCommands(panel: PanelId, commands: PanelCommand[]) {
  const built = useMemo<Command[]>(
    () => commands.map((c) => ({ ...c, scope: panel })),
    // depends on panel + IDs; full deps would require deep compare
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panel, commands.map((c) => c.id).join("|")],
  );
  useRegisterCommands(panel, built);
}
