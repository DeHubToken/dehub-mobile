import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

// Placeholder for a video card component
const VideoCard = ({ title, views, duration, creator, live }: { title: string, views: string, duration?: string, creator: string, live?: boolean }) => (
  <View className="bg-theme-neutrals-800 rounded-lg my-2 overflow-hidden">
    <View className="w-full h-48 bg-theme-neutrals-700 justify-center items-center">
      <View>
        <Ionicons name="image-outline" size={50} color="#aaa" />
      </View>
      {live && (
        <View className="absolute top-2 left-2 bg-red-600 rounded px-1.5 py-0.5">
          <Text className="text-white text-xs font-bold">LIVE</Text>
        </View>
      )}
      {duration && !live && (
        <View className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
          <Text className="text-white text-xs">{duration}</Text>
        </View>
      )}
    </View>
    <View className="p-3">
      <Text className="text-base font-bold text-theme-neutrals-100 mb-1">{title}</Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-sm text-theme-neutrals-300">{creator}</Text>
        <Text className="text-sm text-theme-neutrals-300">{views} views</Text>
      </View>
    </View>
  </View>
);

const videoCardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    marginVertical: theme.spacing.sm,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    width: '100%',
    height: 200,
    backgroundColor: theme.colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholder: {
    // This will be replaced by actual image later
  },
  durationOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: 'white',
    fontSize: 12,
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FF0000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoContainer: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creator: {
    fontSize: 13,
    color: '#bbb',
  },
  views: {
    fontSize: 13,
    color: '#bbb',
  },
});

const categories = ['All', 'Live', 'NFT', 'Minecraft', 'Rocket', 'League', 'Valorant', 'Esports'];

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-theme-neutrals-900">
      <View className="flex-row justify-between items-center p-4 border-b border-theme-neutrals-700">
        <View className="flex-row items-center">
          <Image
            source={require('../assets/banner.png')}
            className="w-32 h-11 mx-2"
            resizeMode="contain"
          />
          <TouchableOpacity className="flex-row items-center bg-theme-neutrals-700 py-1 px-2 rounded">
            <Ionicons name="trophy-outline" size={14} color="white" />
            <Text className="text-theme-neutrals-100 ml-1 text-[8px]">Leaderboard</Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center">
          <TouchableOpacity className="p-1">
            <Ionicons name="search" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity className="rounded-lg ml-2 overflow-hidden">
            <LinearGradient
              colors={[theme.colors.accent, theme.colors.accentSecondary]}
              start={[0, 0]}
              end={[1, 0]}
              style={styles.connectButtonGradient}
            >
              <Text className="text-theme-neutrals-900 font-bold">Connect</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="py-1 px-2 border-b border-theme-neutrals-700 max-h-12"
        contentContainerStyle={{ alignItems: 'center' }}
      >
        {categories.map((category, index) => (
          <TouchableOpacity key={index} className="bg-theme-neutrals-700 py-1.5 px-4 rounded-full mx-1">
            <Text className="text-theme-neutrals-100 text-sm">{category}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView className="flex-1 px-4 pt-2">
        <VideoCard title="WHAT IS A NFT" creator="DEHUB GAMES" views="1.6K" duration="06:24" />
        <VideoCard title="What is an NFT?" creator="Crypto Gaming" views="851" duration="10:01" />
        <VideoCard title="This is the DeHub SO..." creator="SAFIE ACHERY" views="240" duration="08:15" />
        <VideoCard title="Live Gaming Session" creator="DeHub Stream" views="2.7K" live={true} />
        <VideoCard title="The Island" creator="DEHUB" views="281" duration="07:08" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  banner: {
    width: 100,
    height: 28,
    marginRight: theme.spacing.md,
  },
  leaderboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.muted,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
  },
  leaderboardText: {
    color: theme.colors.foreground,
    marginLeft: 4,
    fontSize: 14,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: theme.spacing.xs,
  },
  connectButton: {
    borderRadius: theme.radius.md,
    marginLeft: theme.spacing.sm,
    overflow: 'hidden',
  },
  connectButtonGradient: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md, // Match parent borderRadius
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectButtonText: {
    color: theme.colors.accentForeground,
    fontWeight: 'bold',
  },
  categoryScroll: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    maxHeight: 50, // Constrain the height
  },
  categoryContainer: {
    alignItems: 'center',
  },
  categoryButton: {
    backgroundColor: theme.colors.muted,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    marginHorizontal: theme.spacing.xs,
  },
  categoryButtonText: {
    color: theme.colors.foreground,
    fontSize: 14,
  },
  contentScroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
});