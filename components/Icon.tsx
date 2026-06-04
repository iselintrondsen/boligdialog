import { Ionicons } from '@expo/vector-icons';

interface IconProps {
  size?: number;
  color?: string;
}

export function HomeIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="home-outline" size={size} color={color} />;
}

export function WrenchIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="construct-outline" size={size} color={color} />;
}

export function ChatIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="chatbubble-outline" size={size} color={color} />;
}

export function DocumentIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="document-text-outline" size={size} color={color} />;
}

export function UserIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="person-outline" size={size} color={color} />;
}

export function GridIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="grid-outline" size={size} color={color} />;
}

export function BuildingIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="business-outline" size={size} color={color} />;
}

export function AlertIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="warning-outline" size={size} color={color} />;
}

export function ClipboardIcon({ size = 28, color = '#6B7280' }: IconProps) {
  return <Ionicons name="clipboard-outline" size={size} color={color} />;
}
