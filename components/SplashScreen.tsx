import React from 'react';
import { View, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { theme } from '../theme';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image 
        source={{ uri: 'https://api.a0.dev/assets/image?text=DEHUB%20Logo%20White%20on%20Black%20Background&aspect=16:9&seed=42' }} 
        style={styles.banner} 
        resizeMode="contain" 
      />
      <ActivityIndicator size="large" color={theme.colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  banner: {
    width: 200,
    height: 60,
    marginBottom: theme.spacing.lg,
  },
});