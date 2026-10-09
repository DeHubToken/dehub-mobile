import React, { useState } from 'react';
import { View } from 'react-native';
import SmartImage from '../common/SmartImage';

export default function FeedGatePreview({ uri, priority }: { uri?: string; priority: 'high' | 'normal' }) {
  const [failedUri, setFailedUri] = useState<string>();
  if (!uri || failedUri === uri) return <View style={{ width: '100%', height: '100%', backgroundColor: '#18181b' }} />;
  return <SmartImage source={{ uri }} style={{ width: '100%', height: '100%' }}
    recyclingKey={uri} priority={priority} blurRadius={20} onError={() => setFailedUri(uri)} />;
}
