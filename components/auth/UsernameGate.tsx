import React from 'react';
import { useAuthState, useAuthActions } from '../../context/AuthContext';
import { UsernameRequiredModal } from './UsernameRequiredModal';

export const UsernameGate: React.FC = () => {
  const { needsUsername, provisionalUser } = useAuthState();
  const { completeUsername } = useAuthActions();
  return (
  <UsernameRequiredModal visible={!!needsUsername} provisionalUser={provisionalUser} onComplete={completeUsername} />
  );
};
