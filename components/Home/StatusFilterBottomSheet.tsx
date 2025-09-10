import React, { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, PanResponder, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { statusOptions } from '../../libs';

type StatusFilterBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  selectedSortMode: string;
  onSortModeChange: (mode: string) => void;
};

const StatusFilterBottomSheet: React.FC<StatusFilterBottomSheetProps> = ({ visible, onClose, selectedSortMode, onSortModeChange }) => {
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0.5,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: Dimensions.get('window').height,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return gestureState.dy > 5;
    },
    onPanResponderMove: (evt, gestureState) => {
      if (gestureState.dy > 0) {
        slideAnim.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        onClose();
      } else {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  const handleStatusSelect = (statusId: string) => {
    onSortModeChange(statusId);
    setTimeout(() => {
      onClose();
    }, 150);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <Animated.View 
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            onPress={onClose}
            activeOpacity={1}
          />
        </Animated.View>
        
        <Animated.View
          style={[
            styles.bottomSheet,
            { transform: [{ translateY: slideAnim }] }
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.dragHandle} />
          
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Content Type</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.statusGrid}>
              {statusOptions.map((option) => {
                const isSelected = selectedSortMode === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.statusOption, isSelected && styles.statusOptionSelected]}
                    onPress={() => handleStatusSelect(option.id)}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: option.color || theme.colors.accent }]}>
                      <Ionicons 
                        name={option.icon} 
                        size={24} 
                        color="white"
                      />
                    </View>
                    <Text style={[styles.statusOptionText, isSelected && styles.statusOptionTextSelected]}>
                      {option.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.checkmark}>
                        <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default StatusFilterBottomSheet;

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
  },
  bottomSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: Dimensions.get('window').height * 0.7,
    minHeight: Dimensions.get('window').height * 0.4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.muted,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.foreground,
  },
  closeButton: {
    padding: 4,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  statusGrid: {
    paddingBottom: 20,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.card,
  },
  statusOptionSelected: {
    backgroundColor: theme.colors.muted,
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.foreground,
  },
  statusOptionTextSelected: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  checkmark: {
    marginLeft: 8,
  },
});
