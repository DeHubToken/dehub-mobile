import { useEffect, useRef, useState } from "react";
import { AssemblySession, emptyAssembly, type AssemblyRuntime } from "./assembly";

export function useAssembly(runtime: AssemblyRuntime) {
  const latest = useRef(runtime); latest.current = runtime;
  const [state, setState] = useState(emptyAssembly);
  const [session] = useState(() => new AssemblySession({ current: () => latest.current.current(), create: (...args) => latest.current.create(...args) }, setState));
  useEffect(() => () => session.dispose(), [session]);
  return [state, session] as const;
}
