import React from 'react';
import { ScrollView } from 'react-native';
import CompactVideoCard from '../Home/CompactVideoCard';

// Dummy livestreams data
const dummyLivestreams = [
  {
    id: 'live1',
    title: 'Live: Gaming Session',
    views: 342,
    createdAt: 'Live now',
    thumbnail: 'https://picsum.photos/200/200?random=6',
    likes: 45,
  },
  {
    id: 'live2',
    title: 'Live: Music Jam Session',
    views: 128,
    createdAt: 'Live now',
    thumbnail: 'https://picsum.photos/200/200?random=7',
    likes: 23,
  },
  {
    id: 'live3',
    title: 'Live: Q&A with Fans',
    views: 567,
    createdAt: 'Live now',
    thumbnail: 'https://picsum.photos/200/200?random=8',
    likes: 89,
  },
];

const LivestreamsRoute: React.FC = () => (
  <ScrollView 
    className="flex-1 bg-theme-background" 
    showsVerticalScrollIndicator={false}
    contentContainerStyle={{ paddingVertical: 8 }}
  >
    {dummyLivestreams.map((item) => (
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

export default LivestreamsRoute;
