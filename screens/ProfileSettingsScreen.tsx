import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { ScreenNames } from '../navigation/ScreenNames';

export default function ProfileSettingsScreen({ navigation }) {
  const { user, signOut, isSignedIn } = useAuth();
  const { updateProfile, loading } = useUserProfile();
  
  const [username, setUsername] = useState(user?.username || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateProfile = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }
    
    setIsSaving(true);
    
    try {
      await updateProfile({ username });
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      // Navigation will be handled by RootNavigator
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          onPress: handleSignOut,
          style: 'destructive',
        },
      ]
    );
  };

  const navigateToSignIn = () => {
    navigation.navigate(ScreenNames.SignIn);
  };

  if (!isSignedIn) {
    return (
      <SafeAreaView className="flex-1 bg-theme-background" edges={['top']}>
        <ScreenHeader title="Account" canGoBack />
        
        <View className="flex-1 justify-center items-center p-4">
          <View className="w-20 h-20 rounded-full bg-muted justify-center items-center mb-4">
            <Text className="text-foreground text-3xl font-bold">?</Text>
          </View>
          
          <Text className="text-foreground text-xl font-bold mb-2">Not Signed In</Text>
          <Text className="text-foreground/80 text-base text-center mb-8">
            Sign in to access your profile, save preferences, and sync your content
          </Text>
          
          <TouchableOpacity
            className="bg-accent rounded-lg py-3.5 items-center justify-center w-full max-w-xs"
            onPress={navigateToSignIn}
          >
            <Text className="text-white text-base font-semibold">Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-theme-background" edges={['top']}>
      <ScreenHeader title="Account Settings" canGoBack />
      
      <ScrollView className="p-4">
        <View className="items-center mb-6">
          <View className="mb-3">
            {user?.avatarUrl ? (
              <Image 
                source={{ uri: user.avatarUrl }}
                className="w-20 h-20 rounded-full"
              />
            ) : (
              <View className="w-20 h-20 rounded-full bg-muted justify-center items-center">
                <Text className="text-foreground text-3xl font-bold">{user?.username?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
            )}
          </View>
          
          <Text className="text-foreground text-base">{user?.email}</Text>
        </View>
        
        <View className="mb-6">
          <Text className="text-foreground text-lg font-bold mb-4">Profile Information</Text>
          
          <View className="mb-4">
            <Text className="text-mutedForeground text-sm mb-2">Username</Text>
            {isEditing ? (
              <View className="gap-2">
                <TextInput
                  className="bg-card border border-border rounded-lg px-4 py-3 text-base text-foreground flex-1"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
                <View className="flex-row justify-end gap-2">
                  <TouchableOpacity
                    className={`bg-muted py-2 px-4 rounded items-center justify-center ${isSaving ? 'opacity-50' : ''}`}
                    onPress={() => {
                      setUsername(user?.username || '');
                      setIsEditing(false);
                    }}
                    disabled={isSaving}
                  >
                    <Text className="text-foreground">Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    className={`bg-accent py-2 px-4 rounded items-center justify-center ${isSaving ? 'opacity-50' : ''}`}
                    onPress={handleUpdateProfile}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold">Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="flex-row items-center justify-between">
                <Text className="text-foreground text-base">{user?.username}</Text>
                <TouchableOpacity
                  className="p-2"
                  onPress={() => setIsEditing(true)}
                >
                  <Text className="text-accent font-semibold">Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        
        <View className="mb-6">
          <Text className="text-foreground text-lg font-bold mb-4">Account</Text>
          
          <TouchableOpacity
            className="bg-destructive rounded-lg py-3.5 items-center justify-center"
            onPress={confirmSignOut}
          >
            <Text className="text-destructiveForeground text-base font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


