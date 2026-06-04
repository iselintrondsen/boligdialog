import { Image, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeIcon, WrenchIcon, ChatIcon, DocumentIcon, UserIcon, ClipboardIcon } from '@/components/Icon';

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

export default function TenantLayout() {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const headerHeight = screenHeight < 700 ? 120 : 160;
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitle: () => null,
        headerBackground: () => <LogoBg />,
        headerStyle: { backgroundColor: '#F5F7FA', height: headerHeight },
        headerShadowVisible: false,
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: GRAY,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          paddingBottom: insets.bottom || 8,
          paddingTop: 8,
          height: 56 + (insets.bottom || 8),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIconStyle: { marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hjem',
          tabBarIcon: ({ focused }) => <HomeIcon color={focused ? BLUE : GRAY} />,
        }}
      />
      <Tabs.Screen
        name="issues"
        options={{
          title: 'Feil',
          tabBarIcon: ({ focused }) => <WrenchIcon color={focused ? BLUE : GRAY} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Meldinger',
          tabBarIcon: ({ focused }) => <ChatIcon color={focused ? BLUE : GRAY} />,
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Dokumenter',
          tabBarIcon: ({ focused }) => <DocumentIcon color={focused ? BLUE : GRAY} />,
        }}
      />
      <Tabs.Screen
        name="inspections"
        options={{
          title: 'Rapporter',
          tabBarIcon: ({ focused }) => <ClipboardIcon color={focused ? BLUE : GRAY} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <UserIcon color={focused ? BLUE : GRAY} />,
        }}
      />
    </Tabs>
  );
}
