import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { router, type Href } from 'expo-router';
import { getTagProfileHref } from '@/src/lib/tagNormalizer';

type Props = {
  tag: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function TagChip({ tag, style, textStyle }: Props) {
  return (
    <Pressable
      onPress={() => router.push(getTagProfileHref(tag) as Href)}
      style={[styles.chip, style]}
      accessibilityRole="link"
      accessibilityLabel={`Open ${tag} tag profile`}>
      <Text style={[styles.text, textStyle]}>#{tag}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(126, 34, 206, 0.25)',
  },
  text: {
    color: '#ddd6fe',
    fontSize: 11,
  },
});
