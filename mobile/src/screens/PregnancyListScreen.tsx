/**
 * Pregnancy list screen — shows episodes cached in local SQLite.
 * Offline-created episodes appear with a sync-status indicator.
 */
import React, {useEffect, useState} from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import {brand, urgency, lightColors} from '../theme/colors';
import {SearchBar, FilterChips} from '../components/SearchFilter';
import {BottomTabBar} from '../components/BottomTabBar';
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
    const urgencyColor = cls ? urgency[cls as keyof typeof urgency] || lightColors.textSecondary : lightColors.textSecondary;
    const initials = (snapshot.woman_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return (
      <Pressable
        style={[styles.card, {borderLeftColor: urgencyColor}]}
        onPress={() => navigation.navigate('PregnancyDetail', {episodeId: item.id})}>
        <View style={[styles.avatar, {backgroundColor: urgencyColor + '20'}]}>
          <Text style={[styles.avatarText, {color: urgencyColor}]}>{initials}</Text>
        </View>
        <View style={styles.cardLeft}>
          <Text style={styles.womanName}>{snapshot.woman_name || 'Unknown'}</Text>
          {snapshot.ga_weeks != null && (
            <Text style={styles.ga}>GA: {snapshot.ga_weeks} weeks</Text>
          )}
          {item.sync_status !== 'SYNCED' && (
            <Text style={styles.syncBadge}>
              {item.sync_status === 'NOT_SYNCED' ? 'Pending sync' : item.sync_status}
            </Text>
          )}
        </View>
        {cls && (
          <View style={[styles.urgencyBadge, {borderColor: urgencyColor}]}>
            <Text style={[styles.urgencyText, {color: urgencyColor}]}>{cls}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Active Pregnancies</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => navigation.navigate('PregnancyRegister')}>
          <Text style={styles.addButtonText}>+ Register</Text>
        </Pressable>
      </View>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by woman name..." />
      <FilterChips options={['RED', 'ORANGE', 'AMBER', 'GREEN']} selected={filter} onSelect={setFilter} />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderEpisode}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadEpisodes} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No active pregnancies</Text>
            <Text style={styles.emptySub}>Pull to refresh or register a new episode</Text>
          </View>
        }
      />
      <BottomTabBar activeRoute="PregnancyList" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {fontSize: 20, fontWeight: '700', color: lightColors.textPrimary},
  addButton: {
    backgroundColor: brand.teal,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  list: {padding: 16, gap: 10},
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderLeftWidth: 4,
    borderLeftColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  avatar: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  avatarText: {fontSize: 14, fontWeight: '700'},
  cardLeft: {flex: 1},
  womanName: {fontSize: 16, fontWeight: '600', color: lightColors.textPrimary},
  ga: {fontSize: 13, color: lightColors.textSecondary, marginTop: 4},
  syncBadge: {
    fontSize: 11,
    color: urgency.AMBER,
    marginTop: 4,
    fontWeight: '500',
  },
  urgencyBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  urgencyText: {fontSize: 11, fontWeight: '700'},
  empty: {alignItems: 'center', paddingVertical: 48},
  emptyText: {fontSize: 16, color: lightColors.textSecondary},
  emptySub: {fontSize: 13, color: lightColors.textSecondary, marginTop: 4},
});
