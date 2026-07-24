import React from "react";
import StagesBrowseModal from "./StagesBrowseModal";
import CreateStageModal from "./CreateStageModal";
import LiveStageModal from "./LiveStageModal";

const StagesModalsHost: React.FC = () => {
  return (
    <>
      <StagesBrowseModal />
      <CreateStageModal />
      <LiveStageModal />
    </>
  );
};

export default StagesModalsHost;
