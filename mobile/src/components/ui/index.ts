/**
 * UI kit barrel — the shared primitives every screen should build from.
 *
 *   import {Screen, Card, Button, Field, UrgencyBadge, AppText} from '../components/ui';
 *
 * UX-001: these components are the mobile implementation of the shared design
 * system. Prefer them over hand-rolled StyleSheets so spacing, typography and
 * elevation stay consistent.
 */
export {Icon, hasIcon, type IconName, type IconProps} from './Icon';
export {AppText, textStyles, type AppTextProps, type TextVariant, type TextTone} from './Text';
export {Screen, type ScreenProps} from './Screen';
export {Card, type CardProps} from './Card';
export {Button, type ButtonProps, type ButtonVariant, type ButtonSize} from './Button';
export {Field, type FieldProps} from './Input';
export {Badge, UrgencyBadge, type BadgeProps, type BadgeTone, type BadgeSize, type UrgencyBadgeProps} from './Badge';
export {
  SectionHeader,
  EmptyState,
  ListRow,
  StatCard,
  KeyValue,
  Divider,
  LoadingState,
  type SectionHeaderProps,
  type EmptyStateProps,
  type ListRowProps,
  type StatCardProps,
  type KeyValueProps,
} from './Layout';
