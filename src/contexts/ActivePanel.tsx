import { createContext, useContext, useState, type ReactNode } from "react";

export type PanelId = "diff";

interface ActivePanelContextValue {
  activePanel: PanelId;
  setActivePanel: (id: PanelId) => void;
}

const ActivePanelContext = createContext<ActivePanelContextValue | null>(null);

export function ActivePanelProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<PanelId>("diff");
  return (
    <ActivePanelContext.Provider value={{ activePanel, setActivePanel }}>
      {children}
    </ActivePanelContext.Provider>
  );
}

export function useActivePanel(): ActivePanelContextValue {
  const ctx = useContext(ActivePanelContext);
  if (!ctx) throw new Error("useActivePanel must be inside <ActivePanelProvider>");
  return ctx;
}
