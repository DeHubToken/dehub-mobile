import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import StatusFilterBottomSheet from '../components/Home/StatusFilterBottomSheet';
import VideoCard from '../components/Home/VideoCard';
import HomeHeader from '../components/HomeHeader';
import { getSelectedStatusLabel, getSelectedStatusIcon } from '../libs';
import CategorySelector from '../components/Home/CategorySelector';

const categories = ['All', 'Live', 'NFT', 'Minecraft', 'Rocket', 'League', 'Valorant', 'Esports'];

export default function HomeScreen() {
  const [statusFilterVisible, setStatusFilterVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('All');

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <HomeHeader />

      <View style={styles.filterSection}>
        <TouchableOpacity 
          style={[styles.statusFilterButton, selectedStatus !== 'all' && styles.statusFilterButtonActive]}
          onPress={() => setStatusFilterVisible(true)}
        >
          <Ionicons 
            name={getSelectedStatusIcon(selectedStatus)} 
            size={16} 
            color={selectedStatus !== 'all' ? theme.colors.accentForeground : theme.colors.foreground} 
          />
          <Text style={[styles.statusFilterText, selectedStatus !== 'all' && styles.statusFilterTextActive]}>
            {getSelectedStatusLabel(selectedStatus)}
          </Text>
          <Ionicons 
            name="chevron-down-outline" 
            size={16} 
            color={selectedStatus !== 'all' ? theme.colors.accentForeground : theme.colors.foreground} 
          />
        </TouchableOpacity>

        <CategorySelector
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryPress={setSelectedCategory}
        />
      </View>

      <ScrollView className="flex-1 px-4 pt-2">
        <VideoCard 
          title="WHAT IS A NFT" 
          creator="DEHUB GAMES" 
          views={1600} 
          duration="06:24" 
          thumbnail="https://example.com/nft-thumbnail.jpg" 
          createdAt="2025-07-28T12:00:00Z" 
          likes={120} 
          isLive={true} 
          profilePicture="https://example.com/profile1.jpg" 
          badgeIcon="star" 
        />
        <VideoCard 
          title="What is an NFT?" 
          creator="Crypto Gaming" 
          views={851} 
          duration="10:01" 
          thumbnail="https://example.com/crypto-thumbnail.jpg" 
          createdAt="2025-07-27T15:30:00Z" 
          likes={85} 
          isPayPerView={true} 
          payPerViewAmount={5} 
          payPerViewTokenSymbol="DHB" 
          profilePicture="https://example.com/profile2.jpg" 
          badgeIcon="flash" 
        />
        <VideoCard 
          title="This is the DeHub SO..." 
          creator="SAFIE ACHERY" 
          views={240} 
          duration="08:15" 
          thumbnail="https://example.com/dehub-thumbnail.jpg" 
          createdAt="2025-07-26T10:00:00Z" 
          likes={45} 
          profilePicture="https://example.com/profile3.jpg" 
          badgeIcon="heart" 
        />
        <VideoCard 
          title="Live Gaming Session" 
          creator="DeHub Stream" 
          views={2700} 
          duration="05:34" 
          thumbnail="https://example.com/live-thumbnail.jpg" 
          createdAt="2025-07-25T20:00:00Z" 
          likes={300} 
          isLive={true} 
          profilePicture="https://example.com/profile4.jpg" 
          badgeIcon="radio" 
        />
        <VideoCard 
          title="The Island" 
          creator="DEHUB" 
          views={281} 
          duration="07:08" 
          thumbnail="https://example.com/island-thumbnail.jpg" 
          createdAt="2025-07-24T18:00:00Z" 
          likes={60} 
          isLocked={true} 
          lockContentAmount={10} 
          lockContentTokenSymbol="DHB" 
          profilePicture="https://example.com/profile5.jpg" 
          badgeIcon="lock-closed" 
        />
      </ScrollView>

      <StatusFilterBottomSheet
        visible={statusFilterVisible}
        onClose={() => setStatusFilterVisible(false)}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  connectButtonGradient: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Filter Section Styles
  filterSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  
  // Status Filter Button
  statusFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.muted,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  statusFilterButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  statusFilterText: {
    color: theme.colors.foreground,
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 8,
  },
  statusFilterTextActive: {
    color: theme.colors.accentForeground,
  },
});