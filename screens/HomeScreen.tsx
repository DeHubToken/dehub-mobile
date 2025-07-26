import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

// Local assets
const BannerImage = { uri: 'https://api.a0.dev/assets/image?text=DEHUB%20Logo%20White%20on%20Black%20Background&aspect=4:1&seed=dehub-banner' };

const VideoCard = ({ title, views, duration, creator, live }: { title: string; views: string; duration?: string; creator: string; live?: boolean }) => (
  <View style={styles.card}>
    <View style={styles.thumbnailContainer}>
      <Ionicons name="image-outline" size={50} color="#aaa" />
      {live && (
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
      )}
      {duration && !live && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      )}
    </View>
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardSubtitle}>{creator}</Text>
        <Text style={styles.cardSubtitle}>{views} views</Text>
      </View>
    </View>
  </View>
);

const categories = ['All', 'Live', 'NFT', 'Minecraft', 'Rocket', 'League', 'Valorant', 'Esports'];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Image source={BannerImage} style={styles.banner} resizeMode="contain" />
        <TouchableOpacity style={styles.leaderboardButton}>
          <Ionicons name="trophy-outline" size={20} color={theme.colors.foreground} />
          <Text style={styles.leaderboardText}>Leaderboard</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="search" size={24} color={theme.colors.foreground} />
          </TouchableOpacity>
          <LinearGradient
            colors={[theme.colors.accent, theme.colors.accentSecondary]}
            start={[0, 0]}
            end={[1, 0]}
            style={styles.connectButton}
          >
            <Text style={styles.connectText}>Connect</Text>
          </LinearGradient>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map((category, index) => (
          <TouchableOpacity key={index} style={styles.categoryPill}>
            <Text style={styles.categoryText}>{category}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.cardsContainer}>
        <VideoCard title="WHAT IS A NFT" creator="DEHUB GAMES" views="1.6K" duration="06:24" />
        <VideoCard title="What is an NFT?" creator="Crypto Gaming" views="851" duration="10:01" />
        <VideoCard title="This is the DeHub SO..." creator="SAFIE ACHERY" views="240" duration="08:15" />
        <VideoCard title="Live Gaming Session" creator="DeHub Stream" views="2.7K" live />
        <VideoCard title="The Island" creator="DEHUB" views="281" duration="07:08" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  banner: {
    width: 100,
    height: 30,
  },
  leaderboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.muted,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    marginLeft: theme.spacing.sm,
  },
  leaderboardText: {
    color: theme.colors.foreground,
    marginLeft: theme.spacing.xs,
    fontSize: 14,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.sm,
  },
  connectButton: {
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  connectText: {
    color: theme.colors.accentForeground,
    fontWeight: 'bold',
  },
  categoriesContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  categoriesContent: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  categoryPill: {
    backgroundColor: theme.colors.muted,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    marginRight: theme.spacing.xs,
  },
  categoryText: {
    color: theme.colors.foreground,
    fontSize: 14,
  },
  cardsContainer: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
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
  liveBadge: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: theme.colors.destructive,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  liveBadgeText: {
    color: theme.colors.destructiveForeground,
    fontSize: 12,
    fontWeight: 'bold',
  },
  durationBadge: {
    position: 'absolute',
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  durationText: {
    color: theme.colors.foreground,
    fontSize: 12,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSubtitle: {
    color: theme.colors.mutedForeground,
    fontSize: 14,
  },
});