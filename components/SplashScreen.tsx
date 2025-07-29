import React from 'react';
import { View, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { theme } from '../theme';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../assets/banner.png')} style={styles.banner} resizeMode="contain" />
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