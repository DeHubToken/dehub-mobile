import React from "react";
import { useStages } from "../../context/StageContext";
export default function StagesModalsHost() {
  const { isModalOpen, currentSpace } = useStages();
  if (!isModalOpen && !currentSpace) return null;
  const Surface = currentSpace ? require('./LiveStageModal').default : require('./CreateStageModal').default;
  return <Surface />;
}
