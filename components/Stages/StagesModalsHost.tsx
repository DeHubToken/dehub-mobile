import React from "react";
import CreateStageModal from "./CreateStageModal";
import LiveStageModal from "./LiveStageModal";

/**
 * The two stage surfaces that really are overlays.
 *
 * Discovery used to be a third one (StagesBrowseModal); it is StagesScreen now,
 * so a stage keeps running in here while you browse — the split web has between
 * /stages and its persistent AudioSpacesModal.
 */
const StagesModalsHost: React.FC = () => {
  return (
    <>
      <CreateStageModal />
      <LiveStageModal />
    </>
  );
};

export default StagesModalsHost;
