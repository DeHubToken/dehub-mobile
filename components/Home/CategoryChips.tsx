import React from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';

interface CategoryChipsProps {
  categories: string[];
  active?: string | null;
  onSelect: (cat: string | null) => void;
}

const CategoryChips: React.FC<CategoryChipsProps> = ({ categories, active, onSelect }) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
    >
      <Pressable onPress={() => onSelect(null)} className="mr-2">
        <View className={`px-4 h-8 rounded-full items-center justify-center ${!active ? 'bg-theme-neutrals-100' : 'bg-theme-neutrals-800'}`}> 
          <Text className={`text-xs font-semibold ${!active ? 'text-theme-neutrals-900' : 'text-theme-neutrals-200'}`}>All</Text>
        </View>
      </Pressable>
      {categories.map(cat => {
        const selected = active === cat;
        return (
          <Pressable key={cat} onPress={() => onSelect(cat)} className="mr-2">
            <View className={`px-4 h-8 rounded-full items-center justify-center ${selected ? 'bg-theme-neutrals-100' : 'bg-theme-neutrals-800'}`}> 
              <Text className={`text-xs font-semibold ${selected ? 'text-theme-neutrals-900' : 'text-theme-neutrals-200'}`}>{cat}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export default CategoryChips;
