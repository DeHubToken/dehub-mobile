import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

// Placeholder for a video card component
const VideoCard = ({ title, views, duration, creator, live }: { title: string, views: string, duration?: string, creator: string, live?: boolean }) => (
  <View style={videoCardStyles.card}>
    <View style={videoCardStyles.thumbnailContainer}>
      <View style={videoCardStyles.thumbnailPlaceholder}>
        <Ionicons name="image-outline" size={50} color="#aaa" />
      </View>
      {live && <View style={videoCardStyles.liveBadge}><Text style={videoCardStyles.liveBadgeText}>LIVE</Text></View>}
      {duration && !live && <View style={videoCardStyles.durationOverlay}><Text style={videoCardStyles.durationText}>{duration}</Text></View>}
    </View>
    <View style={videoCardStyles.infoContainer}>
      <Text style={videoCardStyles.title}>{title}</Text>
      <View style={videoCardStyles.detailsContainer}>
        <Text style={videoCardStyles.creator}>{creator}</Text>
        <Text style={videoCardStyles.views}>{views} views</Text>
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('../assets/banner.png')} style={styles.banner} resizeMode="contain" />
          <TouchableOpacity style={styles.leaderboardButton}>
            <Ionicons name="trophy-outline" size={20} color="white" />
            <Text style={styles.leaderboardText}>Leaderboard</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="search" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.connectButton}>
            <LinearGradient
              colors={[theme.colors.accent, theme.colors.accentSecondary]}
              start={[0, 0]}
              end={[1, 0]}
              style={styles.connectButtonGradient}
            >
              <Text style={styles.connectButtonText}>Connect</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContainer}
      >
        {categories.map((category, index) => (
          <TouchableOpacity key={index} style={styles.categoryButton}>
            <Text style={styles.categoryButtonText}>{category}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.contentScroll}>
        {/* Placeholder Video Cards */}
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
    backgroundColor: theme.colors.background,
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