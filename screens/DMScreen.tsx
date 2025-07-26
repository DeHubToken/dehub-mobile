import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function DMScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>DM Screen</Text>
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
  text: {
    color: theme.colors.foreground,
    fontSize: 16,
  },
});