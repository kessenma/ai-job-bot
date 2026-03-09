import React, {useEffect, useState} from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {Text} from '../components/ui/Text';
import {getSheetsStatus, setSheetsUrl, removeSheetsUrl, syncSheets} from '../api/sheets';

export function SheetsScreen() {
  const [url, setUrl] = useState('');
  const [configured, setConfigured] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const status = await getSheetsStatus();
      setConfigured(status.configured);
      setCurrentUrl(status.url);
      if (status.url) setUrl(status.url);
    } catch (err) {
      console.error('Failed to load sheets status:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!url.trim()) return;
    try {
      await setSheetsUrl(url.trim());
      await loadStatus();
      Alert.alert('Success', 'Sheet URL saved');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    }
  }

  async function handleRemove() {
    try {
      await removeSheetsUrl();
      setUrl('');
      await loadStatus();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const jobs = await syncSheets();
      Alert.alert('Synced', `Loaded ${jobs.length} jobs from Google Sheets`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
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
      <Text style={styles.heading}>Google Sheets</Text>

      {configured ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connected</Text>
          <Text style={styles.cardUrl} numberOfLines={2}>{currentUrl}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, syncing && styles.buttonDisabled]}
              onPress={handleSync}
              disabled={syncing}>
              <Text style={styles.buttonText}>
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Text>
            </Pressable>
            <Pressable style={styles.dangerButton} onPress={handleRemove}>
              <Text style={styles.dangerText}>Disconnect</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Google Sheets URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            placeholderTextColor="#666"
            autoCapitalize="none"
          />
          <Pressable style={styles.button} onPress={handleSave}>
            <Text style={styles.buttonText}>Connect Sheet</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
    marginBottom: 8,
  },
  cardUrl: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  dangerText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
