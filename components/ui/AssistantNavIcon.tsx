import React from 'react';
import { Sparkles } from './cut-icons';

export default function AssistantNavIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return <Sparkles size={size} color={color} testID="assistant-nova-n2" />;
}
