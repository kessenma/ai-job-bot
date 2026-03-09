import React from 'react';
import {Text as RNText, TextProps, StyleSheet} from 'react-native';

export function Text({style, ...props}: TextProps) {
  return <RNText selectable style={[styles.selectable, style]} {...props} />;
}

const styles = StyleSheet.create({
  selectable: {
    // @ts-expect-error - userSelect is supported on macOS/web but not in RN types
    userSelect: 'text',
  },
});
