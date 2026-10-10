import type { useProjectHistory } from "./useProjectHistory";
import type { CloudDraftEditor } from "./cloudDraftController";

export function cloudDraftHistoryEditor(history:Pick<ReturnType<typeof useProjectHistory>,"scopeVersion"|"latest"|"isEditing"|"subscribe"|"receive">):CloudDraftEditor{
  return {scope:history.scopeVersion,current:history.latest,isEditing:history.isEditing,subscribe:history.subscribe,receive:history.receive};
}
