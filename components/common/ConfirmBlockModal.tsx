import React from "react";
import { useTranslation } from "react-i18next";
import ConfirmModal from "./ConfirmModal";

export type ConfirmBlockModalProps = {
  visible: boolean;
  mode: "block" | "unblock";
  targetLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

const ConfirmBlockModal: React.FC<ConfirmBlockModalProps> = ({ visible, mode, targetLabel, onConfirm, onCancel, loading }) => {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      visible={visible}
      title={mode === 'block' ? t('common.blockUserTitle') : t('common.unblockUserTitle')}
      description={mode === 'block' ? t('common.blockUserDesc', { name: targetLabel }) : t('common.unblockUserDesc', { name: targetLabel })}
      confirmText={mode === 'block' ? t('common.block') : t('common.unblock')}
      cancelText={t('common.cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
      loading={loading}
      confirmKind={mode === 'block' ? 'danger' : 'primary'}
    />
  );
};

export default ConfirmBlockModal;
