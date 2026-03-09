import React, {useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  Image,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  useWindowDimensions,
} from 'react-native';
import {Text} from './Text';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

interface ZoomableImageProps {
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.5;

export function ZoomableImage({source, style, resizeMode}: ZoomableImageProps) {
  const [visible, setVisible] = useState(false);
  const {width: screenW, height: screenH} = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  function resetTransform() {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }

  function open() {
    resetTransform();
    setVisible(true);
  }

  function close() {
    setVisible(false);
  }

  function zoomIn() {
    const next = Math.min(savedScale.value + ZOOM_STEP, MAX_SCALE);
    scale.value = withTiming(next);
    savedScale.value = next;
  }

  function zoomOut() {
    const next = Math.max(savedScale.value - ZOOM_STEP, MIN_SCALE);
    scale.value = withTiming(next);
    savedScale.value = next;
    if (next <= 1) {
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: translateX.value},
      {translateY: translateY.value},
      {scale: scale.value},
    ],
  }));

  return (
    <>
      <Pressable onPress={open}>
        <Image source={source} style={style} resizeMode={resizeMode} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}>
        <GestureHandlerRootView style={styles.modalRoot}>
          <View style={styles.overlay}>
            {/* Top bar */}
            <View style={styles.topBar}>
              <View style={styles.zoomControls}>
                <Pressable style={styles.zoomButton} onPress={zoomOut}>
                  <Text style={styles.zoomButtonText}>-</Text>
                </Pressable>
                <Pressable style={styles.zoomButton} onPress={zoomIn}>
                  <Text style={styles.zoomButtonText}>+</Text>
                </Pressable>
              </View>
              <Pressable style={styles.closeButton} onPress={close}>
                <Text style={styles.closeButtonText}>X</Text>
              </Pressable>
            </View>

            {/* Zoomable image */}
            <GestureDetector gesture={composed}>
              <Animated.Image
                source={source}
                style={[
                  {
                    width: screenW * 0.9,
                    height: screenH * 0.8,
                  },
                  animatedStyle,
                ]}
                resizeMode="contain"
              />
            </GestureDetector>

            {/* Hint */}
            <Text style={styles.hint}>
              Pinch to zoom | Drag to pan | +/- buttons
            </Text>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  zoomControls: {
    flexDirection: 'row',
    gap: 8,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    position: 'absolute',
    bottom: 30,
    color: '#666',
    fontSize: 12,
  },
});
