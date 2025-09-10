import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { UsernameRequiredModal } from './UsernameRequiredModal';

export const UsernameGate: React.FC = () => {
  const { needsUsername, provisionalUser, completeUsername } = useAuth();
  return (
  <UsernameRequiredModal visible={!!needsUsername} provisionalUser={provisionalUser} onComplete={completeUsername} />
  );
};
