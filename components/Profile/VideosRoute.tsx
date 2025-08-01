import React from 'react';
import { ScrollView } from 'react-native';
import CompactVideoCard from '../Home/CompactVideoCard';

// Dummy video data
const dummyVideos = [
  {
    id: '1',
    title: 'Amazing Sunset Timelapse',
    views: 12500,
    createdAt: '2 days ago',
    thumbnail: 'https://picsum.photos/200/200?random=1',
    likes: 245,
  },
  {
    id: '2',
    title: 'Cooking Tutorial: Perfect Pasta',
    views: 8900,
    createdAt: '1 week ago',
    thumbnail: 'https://picsum.photos/200/200?random=2',
    likes: 189,
  },
  {
    id: '3',
    title: 'Mountain Hiking Adventure',
    views: 15200,
    createdAt: '3 days ago',
    thumbnail: 'https://picsum.photos/200/200?random=3',
    likes: 312,
  },
  {
    id: '4',
    title: 'Guitar Lesson for Beginners',
    views: 6700,
    createdAt: '5 days ago',
    thumbnail: 'https://picsum.photos/200/200?random=4',
    likes: 156,
  },
  {
    id: '5',
    title: 'City Night Photography',
    views: 9800,
    createdAt: '1 day ago',
    thumbnail: 'https://picsum.photos/200/200?random=5',
    likes: 278,
  },
];

const VideosRoute: React.FC = () => (
  <ScrollView 
    className="flex-1 bg-theme-background" 
    showsVerticalScrollIndicator={false}
    contentContainerStyle={{ paddingVertical: 8 }}
  >
    {dummyVideos.map((item) => (
      <CompactVideoCard
        key={item.id}
        title={item.title}
        views={item.views}
        createdAt={item.createdAt}
        thumbnail={item.thumbnail}
        likes={item.likes}
      />
    ))}
  </ScrollView>
);

export default VideosRoute;
