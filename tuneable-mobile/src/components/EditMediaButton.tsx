import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { canEditMedia, type EditableMedia } from '@/src/lib/permissions';
import { colors } from '@/src/theme/colors';

/** Header control for admins, media owners, and verified creators. */
export function EditMediaButton({ media }: { media: EditableMedia }) {
  const { user } = useAuth();
  if (!canEditMedia(user, media)) return null;
  const id = media?._id || media?.id;
  if (!id) return null;

  return (
    <Pressable
      onPress={() => router.push(`/edit-media/${id}` as Href)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Edit media">
      <Ionicons name="create-outline" size={22} color={colors.accentLight} />
    </Pressable>
  );
}
