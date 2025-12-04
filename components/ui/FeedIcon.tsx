import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import MaskedView from '@react-native-masked-view/masked-view';

interface FeedIconProps {
  size?: number;
  color?: string;
  focused?: boolean;
}

const FeedIcon: React.FC<FeedIconProps> = ({ size = 24, color = '#9CA3AF', focused = false }) => {
  const iconContent = (
    <Svg width={size} height={size} viewBox="0 0 26 24" fill="none">
      <Path 
        d="M2.5 23.3167C1.81244 23.3167 1.22389 23.0719 0.734333 22.5823C0.244778 22.0928 0 21.5042 0 20.8167V12.5833C0 12.2389 0.122222 11.9444 0.366667 11.7C0.611111 11.4556 0.905555 11.3333 1.25 11.3333C1.59444 11.3333 1.88889 11.4556 2.13333 11.7C2.37778 11.9444 2.5 12.2389 2.5 12.5833V20.8167H13.3667C13.7111 20.8167 14.0056 20.9389 14.25 21.1833C14.4944 21.4278 14.6167 21.7222 14.6167 22.0667C14.6167 22.4111 14.4944 22.7056 14.25 22.95C14.0056 23.1944 13.7111 23.3167 13.3667 23.3167H2.5ZM7.5 18.3167C6.81244 18.3167 6.22389 18.0719 5.73433 17.5823C5.24478 17.0928 5 16.5042 5 15.8167V7.56667C5 7.22222 5.12222 6.92778 5.36667 6.68333C5.61111 6.43889 5.90556 6.31667 6.25 6.31667C6.59444 6.31667 6.88889 6.43889 7.13333 6.68333C7.37778 6.92778 7.5 7.22222 7.5 7.56667V15.8167H18.3667C18.7111 15.8167 19.0056 15.9389 19.25 16.1833C19.4944 16.4278 19.6167 16.7222 19.6167 17.0667C19.6167 17.4111 19.4944 17.7056 19.25 17.95C19.0056 18.1944 18.7111 18.3167 18.3667 18.3167H7.5ZM12.5 13.3167C11.8124 13.3167 11.2239 13.0719 10.7343 12.5823C10.2448 12.0928 10 11.5042 10 10.8167V2.5C10 1.81244 10.2448 1.22389 10.7343 0.734334C11.2239 0.244779 11.8124 0 12.5 0H23.45C24.1376 0 24.7261 0.244779 25.2157 0.734334C25.7052 1.22389 25.95 1.81244 25.95 2.5V10.8167C25.95 11.5042 25.7052 12.0928 25.2157 12.5823C24.7261 13.0719 24.1376 13.3167 23.45 13.3167H12.5ZM12.5 10.8167H23.45V5H12.5V10.8167Z" 
        fill={focused ? "url(#gradient)" : color}
      />
      {focused && (
        <Defs>
          <LinearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#4F8EF7" />
            <Stop offset="100%" stopColor="#A7C5FF" />
          </LinearGradient>
        </Defs>
      )}
    </Svg>
  );

  if (focused) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {iconContent}
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {iconContent}
    </View>
  );
};

export default FeedIcon;
