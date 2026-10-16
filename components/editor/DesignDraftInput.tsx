import React, { createContext, useContext, useEffect, useRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";

export const DesignDraftContext = createContext<(() => ProjectEditLease | null) | null>(null);

/** A focused design draft reserves the current project until it is applied or left. */
export function DesignDraftInput(props: TextInputProps) {
  const begin = useContext(DesignDraftContext);
  const lease = useRef<ProjectEditLease | null>(null);
  useEffect(() => () => { lease.current?.release(); lease.current = null; }, []);
  return <TextInput {...props} onFocus={event => {
    lease.current?.release(); lease.current = begin?.() ?? null;
    props.onFocus?.(event);
  }} onBlur={event => {
    try { props.onBlur?.(event); } finally { lease.current?.release(); lease.current = null; }
  }} />;
}
