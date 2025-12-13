import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, PanResponder, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { statusOptions } from '../../libs';
import AccentButtonGradient from '../ui/AccentButtonGradient';

type StatusFilterBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  selectedSortMode: string;
  onSortModeChange: (mode: string) => void;
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
};

type RangeOption = {
  id: string;
  label: string;
  icon: string;
};

const rangeOptions: RangeOption[] = [
  { id: 'all', label: 'All', icon: 'infinite-outline' },
  { id: 'day', label: 'Today', icon: 'today-outline' },
  { id: 'week', label: 'This Week', icon: 'calendar-outline' },
  { id: 'month', label: 'This Month', icon: 'calendar-number-outline' },
  { id: 'year', label: 'This Year', icon: 'time-outline' },
];

const StatusFilterBottomSheet: React.FC<StatusFilterBottomSheetProps> = ({ 
  visible, 
  onClose, 
  selectedSortMode, 
  onSortModeChange,
  selectedRange = '',
  onRangeChange 
}) => {
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [localSortMode, setLocalSortMode] = useState(selectedSortMode);
  const [localRange, setLocalRange] = useState(selectedRange);

  React.useEffect(() => {
    if (visible) {
      // Reset local state to current selections when modal opens
      setLocalSortMode(selectedSortMode);
      setLocalRange(selectedRange);
      
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
  }, [visible, selectedSortMode, selectedRange]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return gestureState.dy > 2;
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
    setLocalSortMode(statusId);
  };

  const handleRangeSelect = (rangeId: string) => {
    setLocalRange(rangeId);
  };

  const handleApply = () => {
    // Apply the changes to parent state
    onSortModeChange(localSortMode);
    if (onRangeChange) {
      onRangeChange(localRange === 'all' ? '' : localRange);
    }
    
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
        >
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            <View style={styles.dragArea} {...panResponder.panHandlers}>
              <View style={styles.dragHandle} />
            </View>
            
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Filter Content</Text>
                <Text style={styles.sheetSubtitle}>Choose type and time range</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={theme.colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetContent}>
              <View style={styles.twoColumnContainer}>
                {/* Left Column - Content Type */}
                <View style={styles.leftColumn}>
                  <View style={styles.columnHeader}>
                    <Ionicons name="grid-outline" size={16} color={theme.colors.accent} />
                    <Text style={styles.columnTitle}>Content Type</Text>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} style={styles.columnScroll}>
                    {statusOptions.map((option, idx) => {
                      const isSelected = localSortMode === option.id;
                      const isLast = idx === statusOptions.length - 1;
                      const isFirst = idx === 0;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[
                            styles.statusOption,
                            isSelected && styles.statusOptionSelected,
                            isFirst && styles.statusOptionTopRound,
                            isLast && styles.statusOptionBottomRound,
                          ]}
                          onPress={() => handleStatusSelect(option.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.iconCircle, isSelected && styles.iconCircleSelected]}>
                            <Ionicons
                              name={option.icon as any}
                              size={18}
                              color={isSelected ? theme.colors.accent : theme.colors.mutedForeground}
                            />
                          </View>
                          <Text style={[styles.statusOptionText, isSelected && styles.statusOptionTextSelected]}>
                            {option.label}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Right Column - Time Range */}
                <View style={styles.rightColumn}>
                  <View style={styles.columnHeader}>
                    <Ionicons name="time-outline" size={16} color={theme.colors.accent} />
                    <Text style={styles.columnTitle}>Time</Text>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} style={styles.columnScroll}>
                    {rangeOptions.map((option, idx) => {
                      const isSelected = (localRange === '' && option.id === 'all') || localRange === option.id;
                      const isLast = idx === rangeOptions.length - 1;
                      const isFirst = idx === 0;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[
                            styles.rangeOption,
                            isSelected && styles.rangeOptionSelected,
                            isFirst && styles.statusOptionTopRound,
                            isLast && styles.statusOptionBottomRound,
                          ]}
                          onPress={() => handleRangeSelect(option.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.iconCircleSmall, isSelected && styles.iconCircleSelected]}>
                            <Ionicons
                              name={option.icon as any}
                              size={14}
                              color={isSelected ? theme.colors.accent : theme.colors.mutedForeground}
                            />
                          </View>
                          <Text style={[styles.rangeOptionText, isSelected && styles.rangeOptionTextSelected]} numberOfLines={1}>
                            {option.label.replace('This ', '')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Apply Button */}
              <View style={styles.applyButtonContainer}>
                <AccentButtonGradient borderRadius={9999}>
                  <TouchableOpacity 
                    style={styles.applyButton}
                    onPress={handleApply}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.applyButtonText}>Apply Filters</Text>
                  </TouchableOpacity>
                </AccentButtonGradient>
              </View>
            </View>
          </SafeAreaView>
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
    maxHeight: Dimensions.get('window').height * 0.75,
    height: Dimensions.get('window').height * 0.6,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.muted,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  dragArea: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.foreground,
    marginBottom: 2,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: theme.colors.mutedForeground,
  },
  closeButton: {
    padding: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
  },
  sheetContent: {
    flex: 1,
    paddingTop: 10,
    // minHeight: 0,
  },
  twoColumnContainer: {
    flexDirection: 'row',
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  leftColumn: {
    flex: 2.2,
  },
  rightColumn: {
    flex: 1,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  columnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.foreground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  columnScroll: {
    flex: 1,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statusOptionSelected: {
    backgroundColor: 'rgba(79, 142, 247, 0.12)',
    borderColor: theme.colors.accent,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconCircleSelected: {
    backgroundColor: 'rgba(79, 142, 247, 0.2)',
  },
  iconCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statusOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.mutedForeground,
  },
  statusOptionTextSelected: {
    color: theme.colors.foreground,
    fontWeight: '700',
  },
  rangeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rangeOptionSelected: {
    backgroundColor: 'rgba(79, 142, 247, 0.12)',
    borderColor: theme.colors.accent,
  },
  rangeOptionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.mutedForeground,
  },
  rangeOptionTextSelected: {
    color: theme.colors.foreground,
    fontWeight: '700',
  },
  statusOptionTopRound: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  statusOptionBottomRound: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  applyButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  applyButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
