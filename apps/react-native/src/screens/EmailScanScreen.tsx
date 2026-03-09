import React, {useState} from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {Text} from '../components/ui/Text';
import {getGmailStatus, scanEmails} from '../api/gmail';
import {getJobs} from '../api/jobs';

export function EmailScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<unknown[] | null>(null);

  async function handleScan() {
    setScanning(true);
    try {
      const status = await getGmailStatus();
      if (!status.authenticated) {
        setResults(null);
        return;
      }

      const jobs = await getJobs();
      const companies = [...new Set(jobs.map(j => j.company).filter(Boolean))];
      const scanResults = await scanEmails(companies);
      setResults(scanResults);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Email Scanner</Text>
      <Text style={styles.description}>
        Scan your Gmail for responses from companies you've applied to.
      </Text>

      <Pressable
        style={[styles.button, scanning && styles.buttonDisabled]}
        onPress={handleScan}
        disabled={scanning}>
        {scanning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Scan Emails</Text>
        )}
      </Pressable>

      {results && (
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>
            Scanned {(results as unknown[]).length} companies
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 20,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
