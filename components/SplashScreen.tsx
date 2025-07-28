import React from 'react';
import { View, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { theme } from '../theme';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image source={{ uri: 'https://api.a0.dev/assets/image?text=DEHUB&aspect=1:1&seed=1' }} style={styles.banner} resizeMode="contain" />
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
    width: 160,
    height: 45,
    marginBottom: theme.spacing.lg,
  },
});