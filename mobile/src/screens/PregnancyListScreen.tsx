/**
 * Pregnancy list screen — shows episodes cached in local SQLite.
 * Offline-created episodes appear with a sync-status indicator.
 *
 * UX-003: restyled with the shared design system primitives and SVG icons.
 * Clinical behaviour, queries, navigation and accessibility are unchanged.
 */
import React, {useEffect, useState} from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';
import {SearchBar, FilterChips} from '../components/SearchFilter';
import {BottomTabBar} from '../components/BottomTabBar';
import {AppText} from '../components/ui/Text';
import {Icon} from '../components/ui/Icon';
import {Button} from '../components/ui/Button';
import {UrgencyBadge} from '../components/ui/Badge';
import {EmptyState} from '../components/ui/Layout';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyList'>;

interface EpisodeRow {
  id: string;
  subject_id: string;
  status: string;
  snapshot: string;
  sync_status: string;
  minimum_class?: string;
}

export function PregnancyListScreen({navigation}: Props) {
  const {colors} = useTheme();
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  const loadEpisodes = () => {
    setRefreshing(true);
    try {
      const rows = query(
        `SELECT e.id, e.subject_id, e.status, e.snapshot, e.sync_status,
                (SELECT a.minimum_class FROM assessments a WHERE a.episode_id = e.id ORDER BY a.assessed_at DESC LIMIT 1) as minimum_class
         FROM episodes e
         WHERE e.module = 'PREGNANCY' AND e.status = 'ACTIVE'
         ORDER BY e.updated_at DESC`,
      );
      setEpisodes(rows as unknown as EpisodeRow[]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEpisodes();
  }, []);

  const filtered = episodes.filter(e => {
    const snap = JSON.parse(e.snapshot) as {woman_name?: string; ga_weeks?: number};
    const name = (snap.woman_name || '').toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase());
    const matchesFilter = !filter || e.minimum_class === filter;
    return matchesSearch && matchesFilter;
  });

  const renderEpisode = ({item}: {item: EpisodeRow}) => {
    const snapshot = JSON.parse(item.snapshot) as {woman_name?: string; ga_weeks?: number};
    const cls = item.minimum_class;
    const initials = (snapshot.woman_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return (
      <Pressable
        style={({pressed}) => [
          styles.card,
          {backgroundColor: colors.surface, borderColor: colors.border},
          pressed && styles.cardPressed,
        ]}
        onPress={() => navigation.navigate('PregnancyDetail', {episodeId: item.id})}
        accessibilityRole="button"
        accessibilityLabel={`Open pregnancy for ${snapshot.woman_name || 'Unknown'}`}>
        <View style={[styles.avatar, {backgroundColor: colors.primarySubtle, borderColor: colors.border}]}>
          <AppText variant="smallStrong" tone="brand">{initials}</AppText>
        </View>
        <View style={styles.cardBody}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {snapshot.woman_name || 'Unknown'}
          </AppText>
          {snapshot.ga_weeks != null && (
            <AppText variant="small" tone="secondary" style={styles.ga}>
              GA: {snapshot.ga_weeks} weeks
            </AppText>
          )}
          {item.sync_status !== 'SYNCED' && (
            <View style={styles.syncRow}>
              <Icon name="refresh" size={12} color={colors.warning} strokeWidth={2} />
              <AppText variant="caption" tone="warning">
                {item.sync_status === 'NOT_SYNCED' ? 'Pending sync' : item.sync_status}
              </AppText>
            </View>
          )}
        </View>
        {cls && <UrgencyBadge value={cls} size="sm" />}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <AppText variant="h2">Active Pregnancies</AppText>
        <Button
          label="Register"
          onPress={() => navigation.navigate('PregnancyRegister')}
          icon="plus"
          size="sm"
          accessibilityLabel="Register a new pregnancy"
        />
      </View>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by woman name..." />
      <FilterChips options={['RED', 'ORANGE', 'AMBER', 'GREEN']} selected={filter} onSelect={setFilter} />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderEpisode}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadEpisodes} tintColor={colors.primary} colors={[colors.primary]} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="heart"
            title="No active pregnancies"
            message="Pull to refresh or register a new episode."
            action={{label: 'Register Pregnancy', onPress: () => navigation.navigate('PregnancyRegister')}}
          />
        }
      />
      <BottomTabBar activeRoute="PregnancyList" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  list: {padding: space[4], gap: space[2]},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: space[3],
  },
  cardPressed: {opacity: 0.9, transform: [{scale: 0.985}]},
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: border.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {flex: 1},
  ga: {marginTop: 2},
  syncRow: {flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: 2},
});
