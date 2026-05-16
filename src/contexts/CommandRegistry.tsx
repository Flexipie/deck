import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PanelId } from "./ActivePanel";

export type CommandScope = "global" | PanelId;

export interface Command {
  id: string;
  label: string;
  hint?: string;
  scope: CommandScope;
  execute: () => void | Promise<void>;
}

interface RegistryStore {
  register: (scope: CommandScope, cmds: Command[]) => () => void;
  snapshot: () => ReadonlyMap<string, Command[]>;
  subscribe: (fn: () => void) => () => void;
}

function createStore(): RegistryStore {
  let commands: Map<string, Command[]> = new Map();
  const subscribers = new Set<() => void>();
  const notify = () => subscribers.forEach((fn) => fn());
  const replace = (mutator: (m: Map<string, Command[]>) => void) => {
    const next = new Map(commands);
    mutator(next);
    commands = next;
    notify();
  };
  return {
    register(scope, cmds) {
      replace((m) => {
        const existing = m.get(scope) ?? [];
        m.set(scope, [...existing, ...cmds]);
      });
      return () => {
        replace((m) => {
          const filtered = (m.get(scope) ?? []).filter(
            (c) => !cmds.some((nc) => nc.id === c.id),
          );
          if (filtered.length === 0) m.delete(scope);
          else m.set(scope, filtered);
        });
      };
    },
    snapshot() {
      return commands;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

interface PaletteCtx {
  store: RegistryStore;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandRegistryContext = createContext<PaletteCtx | null>(null);

export function CommandRegistryProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<RegistryStore | null>(null);
  if (!storeRef.current) storeRef.current = createStore();
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<PaletteCtx>(
    () => ({
      store: storeRef.current!,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
    }),
    [isOpen],
  );

  return (
    <CommandRegistryContext.Provider value={value}>
      {children}
    </CommandRegistryContext.Provider>
  );
}

export function useCommandRegistry(): PaletteCtx {
  const ctx = useContext(CommandRegistryContext);
  if (!ctx) throw new Error("useCommandRegistry must be inside <CommandRegistryProvider>");
  return ctx;
}

export function useRegisterCommands(scope: CommandScope, commands: Command[]) {
  const { store } = useCommandRegistry();
  const ref = useRef(commands);
  ref.current = commands;
  const idsKey = commands.map((c) => c.id).join("|") + "::" + scope;
  // The registered commands wrap each `execute` in an indirection that reads
  // from `ref.current` at call time. Without this, the registry holds the
  // first-render closures — which often close over stale `worktreeId`,
  // `base`, `head`, or hook state from before identity/diff finished loading.
  const stableCommands = useMemo<Command[]>(
    () =>
      commands.map((c) => ({
        id: c.id,
        label: c.label,
        hint: c.hint,
        scope: c.scope,
        execute: async () => {
          const fresh = ref.current.find((x) => x.id === c.id);
          if (!fresh) return;
          return fresh.execute();
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );
  useEffect(() => {
    return store.register(scope, stableCommands);
  }, [store, stableCommands]);
}

export function useCommands(activePanel: PanelId): Command[] {
  const { store } = useCommandRegistry();
  const subscribe = useCallback((fn: () => void) => store.subscribe(fn), [store]);
  const getSnapshot = useCallback(() => store.snapshot(), [store]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => {
    const panelCmds = snap.get(activePanel) ?? [];
    const global = snap.get("global") ?? [];
    return [...panelCmds, ...global];
  }, [snap, activePanel]);
}
