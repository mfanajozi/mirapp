import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

const COLORS = {
  success: { bg: '#F0FFF4', border: '#22C55E', text: '#166534', icon: 'check-circle' as const },
  error:   { bg: '#FFF5F5', border: '#E53E3E', text: '#9B1C1C', icon: 'alert-circle' as const },
  info:    { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF', icon: 'info' as const },
};

export default function StatusOverlay({ visible, message, type }: Props) {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -80, duration: 300, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const colors = COLORS[type];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderLeftColor: colors.border,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="none"
    >
      <Feather name={colors.icon} size={18} color={colors.border} />
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 999,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
  },
});
