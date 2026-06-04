import { useState, useEffect } from 'react';
import { Image, View } from 'react-native';
import { Tabs } from 'expo-router';
import { GridIcon, BuildingIcon, WrenchIcon, ChatIcon, UserIcon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

const LogoBg = () => (
  <View style={{ flex: 1, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
    <Image
      source={require('@/assets/transperant-icon2-cropped.png')}
      style={{ width: 80, height: 80 }}
      resizeMode="contain"
    />
  </View>
);

const BLUE = '#1A56A0';
const GRAY = '#6B7280';

export default function LandlordLayout() {
  const { user } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('messages')
      .select(`id, units!inner(properties!inner(landlord_id))`)
      .eq('units.properties.landlord_id', user.id)
      .neq('sender_id', user.id)
      .is('read_at', null) as any;
    setUnreadCount(data?.length ?? 0);
  };

  useEffect(() => {
    fetchUnread();
    const channel = supabase.channel('landlord-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: () => null,
        headerBackground: () => <LogoBg />,
        headerStyle: { backgroundColor: '#F5F7FA', height: 160 },
        headerShadowVisible: false,
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: GRAY,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          paddingBottom: 24,
          paddingTop: 8,
          height: 80,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIconStyle: { marginBottom: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hjem', tabBarIcon: ({ focused }) => <GridIcon color={focused ? BLUE : GRAY} /> }} />
      <Tabs.Screen name="properties" options={{ title: 'Eiendommer', tabBarIcon: ({ focused }) => <BuildingIcon color={focused ? BLUE : GRAY} /> }} />
      <Tabs.Screen name="issues" options={{ title: 'Feilmelding', tabBarIcon: ({ focused }) => <WrenchIcon color={focused ? BLUE : GRAY} /> }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Meldinger',
          tabBarIcon: ({ focused }) => <ChatIcon color={focused ? BLUE : GRAY} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 11 },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <UserIcon color={focused ? BLUE : GRAY} /> }} />
      <Tabs.Screen name="property/[id]" options={{ href: null }} />
      <Tabs.Screen name="inspection" options={{ href: null }} />
    </Tabs>
  );
}
