import { formatDelimitedData } from "./delimitedData";
import { useEffect, useMemo, useState } from "react";
import { parseChartSource } from "./chartSeries";
import { chartFilteredIndices, chartRowFilterDraft, type ChartRowFilter } from "./chartRowFilters";
export function useChartRowFilters(source: string, multiple: boolean, value: ChartRowFilter[] | undefined, onChange: (value?: ChartRowFilter[]) => void) {
  const parsed = useMemo(() => { try { return { ...parseChartSource(source, multiple), error: "" }; } catch (reason) { return { rows: [], series: undefined, error: reason instanceof Error ? reason.message : "Correct the source data to inspect matching rows" }; } }, [source, multiple]);
  const [editing, setEditing] = useState<number | null>(null), [kind, setKind] = useState<ChartRowFilter["kind"]>("label"), [operator, setOperator] = useState<Extract<ChartRowFilter, { kind: "label" }>["operator"]>("contains"), [text, setText] = useState(""), [caseSensitive, setCaseSensitive] = useState(false), [target, setTarget] = useState("first"), [minimum, setMinimum] = useState(""), [maximum, setMaximum] = useState(""), [first, setFirst] = useState("1"), [last, setLast] = useState("50"), [error, setError] = useState("");
  const filters = value ?? [], names = parsed.series?.map(series => series.label) ?? [];
  useEffect(() => { setEditing(null); setError(""); }, [value]);
  const indices = useMemo(() => chartFilteredIndices({ rows: parsed.rows, series: parsed.series, filters: value }), [parsed, value]), matching = indices.length;
  const displayedSource = useMemo(() => {
    if (parsed.error || !indices.length) return null;
    const sets = parsed.series ?? [{ label: "Value", values: parsed.rows.map(row => row.value) }], rows = indices.map(index => [parsed.rows[index].label, ...sets.map(series => series.values[index])]);
    return formatDelimitedData(multiple ? [["Label", ...sets.map(series => series.label)], ...rows] : rows, "\t");
  }, [parsed, indices, multiple]);
  const missing = filters.flatMap((filter, index) => filter.kind === "value" && filter.target === "series" && names.filter(name => name === filter.series).length !== 1 && filter.enabled !== false ? [index + 1] : []);
  const save = () => {
    try {
      const named = target.startsWith("series:"), name = named ? target.slice(7) : undefined;
      if (kind === "value" && named && names.filter(series => series === name).length !== 1) throw new Error("Choose a current data series for the filter");
      const filter = chartRowFilterDraft(kind, { operator, text, caseSensitive, target: named ? "series" : target === "total" ? "total" : "first", series: name, minimum, maximum, first, last, enabled: editing === null ? true : filters[editing]?.enabled !== false });
      if (editing === null && filters.length >= 3) throw new Error("Keep up to three chart filters");
      onChange(editing === null ? [...filters, filter] : filters.map((previous, index) => index === editing ? filter : previous));
      setEditing(null); setText(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this chart filter"); }
  };
  const edit = (index: number) => {
    const filter = filters[index]; if (!filter) return;
    setEditing(index); setKind(filter.kind); setError("");
    if (filter.kind === "label") { setOperator(filter.operator); setText(filter.text); setCaseSensitive(!!filter.caseSensitive); }
    else if (filter.kind === "rows") { setFirst(String(filter.first)); setLast(String(filter.last)); }
    else { setTarget(filter.target === "series" ? "series:" + filter.series : filter.target); setMinimum(filter.minimum === undefined ? "" : String(filter.minimum)); setMaximum(filter.maximum === undefined ? "" : String(filter.maximum)); }
  };
  const remove = (index: number) => { const next = filters.filter((_, position) => index !== position); onChange(next.length ? next : undefined); };
  const toggle = (index: number) => onChange(filters.map((filter, position) => index === position ? { ...filter, enabled: filter.enabled === false } : filter));
  return { filters, names, matching, displayedSource, total: parsed.rows.length, sourceError: parsed.error, missing, editing, setEditing, kind, setKind, operator, setOperator, text, setText, caseSensitive, setCaseSensitive, target, setTarget, minimum, setMinimum, maximum, setMaximum, first, setFirst, last, setLast, error, save, edit, remove, toggle, clear: () => onChange(undefined) };
}
