import React from "react";
import ConfirmModal from "./ConfirmModal";

export type ConfirmBlockModalProps = {
  visible: boolean;
  mode: "block" | "unblock";
  targetLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

const ConfirmBlockModal: React.FC<ConfirmBlockModalProps> = ({ visible, mode, targetLabel, onConfirm, onCancel, loading }) => (
  <ConfirmModal
    visible={visible}
    title={mode === 'block' ? 'Block user?' : 'Unblock user?'}
    description={mode === 'block' ? `You won’t receive messages from ${targetLabel}. You can unblock later.` : `Allow messages from ${targetLabel} again.`}
    confirmText={mode === 'block' ? 'Block' : 'Unblock'}
    cancelText="Cancel"
    onConfirm={onConfirm}
    onCancel={onCancel}
    loading={loading}
    confirmKind={mode === 'block' ? 'danger' : 'primary'}
  />
);

export default ConfirmBlockModal;
