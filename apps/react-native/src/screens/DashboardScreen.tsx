import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {Text} from '../components/ui/Text';
import type {JobLead, ATSPlatform} from '@job-app-bot/shared';
import {ATS_DIFFICULTY} from '@job-app-bot/shared';
import {getJobs} from '../api/jobs';

const STATUS_FILTERS = ['all', 'ready', 'applied', 'follow-up', 'rejected'] as const;

export function DashboardScreen() {
  const [jobs, setJobs] = useState<JobLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const loadJobs = useCallback(async () => {
    try {
      const data = await getJobs();
      setJobs(data);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    const status = (job.applicationStatus || '').toLowerCase();
    return status.includes(filter);
  });

  function getDifficultyColor(platform: ATSPlatform): string {
    const difficulty = ATS_DIFFICULTY[platform];
    if (difficulty === 'easy') return '#22c55e';
    if (difficulty === 'medium') return '#f59e0b';
    return '#ef4444';
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{jobs.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>
            {jobs.filter(j => j.applicationStatus?.toLowerCase().includes('applied')).length}
          </Text>
          <Text style={styles.statLabel}>Applied</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}>
            <Text
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredJobs}
        keyExtractor={(_, i) => String(i)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadJobs();
            }}
          />
        }
        renderItem={({item}) => (
          <View style={styles.jobRow}>
            <View style={styles.jobHeader}>
              <Text style={styles.company}>{item.company}</Text>
              <View
                style={[
                  styles.badge,
                  {backgroundColor: getDifficultyColor(item.atsPlatform)},
                ]}>
                <Text style={styles.badgeText}>{item.atsPlatform}</Text>
              </View>
            </View>
            <Text style={styles.role}>{item.role}</Text>
            {item.location ? (
              <Text style={styles.location}>{item.location}</Text>
            ) : null}
            {item.applicationStatus ? (
              <Text style={styles.status}>{item.applicationStatus}</Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              No jobs found. Connect Google Sheets or import a CSV to get started.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
  },
  filterChipActive: {
    backgroundColor: '#6366f1',
  },
  filterText: {
    color: '#888',
    fontSize: 13,
  },
  filterTextActive: {
    color: '#fff',
  },
  jobRow: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    padding: 14,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  company: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  role: {
    fontSize: 14,
    color: '#ccc',
  },
  location: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  status: {
    fontSize: 12,
    color: '#6366f1',
    marginTop: 4,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    fontSize: 14,
  },
});
