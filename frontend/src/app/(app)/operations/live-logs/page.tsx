'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { buildWebSocketUrl, getAccessToken } from '@/lib/runtime';

interface Log {
  id: number;
  timestamp: string;
  level: string;
  category: string;
  title: string;
  message?: string;
  tool_name?: string;
  api_route?: string;
  duration_ms?: number;
  status?: string;
  error_message?: string;
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: '#888888',
  INFO: '#00ff00',
  WARNING: '#ffff00',
  ERROR: '#ff0000',
  CRITICAL: '#ff00ff',
  SUCCESS: '#00ff00',
};

const CATEGORY_COLORS: Record<string, string> = {
  API: '#00ccff',
  TOOL: '#ffaa00',
  SYSTEM: '#aa00ff',
  AGENT: '#ffffff',
  DATABASE: '#0088ff',
  WEBSOCKET: '#ff0088',
  BACKGROUND: '#88ff00',
  GOOGLE_SHEETS: '#00ff88',
  AUTH: '#ff6600',
  DEPLOYMENT: '#ff00cc',
};

export default function LiveLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<Log[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterTool, setFilterTool] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const autoscrollRef = useRef(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoscrollRef.current && logsContainerRef.current && !isPaused) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  // Connect to WebSocket
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const token = getAccessToken() || '';
        const wsUrl = `${buildWebSocketUrl('/api/ws/logs')}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsConnected(true);
          setConnectionAttempts(0);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'connected') {
            } else if (data.level && data.title) {
              // This is a log entry
              if (!isPaused) {
                setLogs((prevLogs) => [
                  ...prevLogs.slice(-999), // Keep last 1000 logs
                  {
                    id: data.id || Date.now(),
                    timestamp: data.timestamp,
                    level: data.level || 'INFO',
                    category: data.category || 'SYSTEM',
                    title: data.title,
                    message: data.message,
                    tool_name: data.tool_name,
                    api_route: data.api_route,
                    duration_ms: data.duration_ms,
                    status: data.status,
                    error_message: data.error_message,
                  },
                ]);
              }
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setIsConnected(false);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          
          // Reconnect with exponential backoff
          if (connectionAttempts < 5) {
            setTimeout(
              () => {
                setConnectionAttempts((prev) => prev + 1);
                connectWebSocket();
              },
              Math.min(1000 * Math.pow(2, connectionAttempts), 30000)
            );
          }
        };

        wsRef.current = ws;
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Filter logs based on search criteria
  const filteredLogs = logs.filter((log) => {
    if (filterLevel && log.level !== filterLevel) return false;
    if (filterCategory && log.category !== filterCategory) return false;
    if (filterTool && log.tool_name !== filterTool) return false;
    if (
      searchText &&
      !log.title.toLowerCase().includes(searchText.toLowerCase()) &&
      !log.message?.toLowerCase().includes(searchText.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return isoString;
    }
  };

  const handleClearLogs = () => {
    if (confirm('Clear all logs?')) {
      setLogs([]);
    }
  };

  const handleExportLogs = () => {
    const jsonString = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          <h1>⚡ FOPS Activity Stream</h1>
          <div className={styles.statusIndicator}>
            <span
              className={`${styles.statusDot} ${isConnected ? styles.connected : styles.disconnected}`}
            />
            <span className={styles.statusText}>
              {isConnected ? 'Live' : `Disconnected (attempt ${connectionAttempts})`}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarGroup}>
            <input
              type="text"
              placeholder="Search logs..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.toolbarGroup}>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Levels</option>
              <option value="DEBUG">Debug</option>
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="ERROR">Error</option>
              <option value="SUCCESS">Success</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Categories</option>
              <option value="API">API</option>
              <option value="TOOL">Tool</option>
              <option value="SYSTEM">System</option>
              <option value="AGENT">Agent</option>
              <option value="BACKGROUND">Background</option>
            </select>
          </div>

          <div className={styles.toolbarGroup}>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`${styles.button} ${isPaused ? styles.buttonPaused : ''}`}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>

            <button onClick={handleExportLogs} className={styles.button}>
              ↓ Export
            </button>

            <button onClick={handleClearLogs} className={styles.button}>
              🗑 Clear
            </button>
          </div>
        </div>

        <div className={styles.stats}>
          <span>Showing {filteredLogs.length} of {logs.length} logs</span>
          <span>•</span>
          <span className={styles.errorCount}>
            Errors: {logs.filter((l) => l.level === 'ERROR').length}
          </span>
        </div>
      </div>

      {/* Log Terminal */}
      <div ref={logsContainerRef} className={styles.terminal}>
        {filteredLogs.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No logs yet. Waiting for activity...</p>
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={log.id || index}
              className={styles.logEntry}
              onClick={() =>
                setExpandedLogId(expandedLogId === log.id ? null : log.id)
              }
              style={{
                borderLeftColor: LEVEL_COLORS[log.level] || '#888',
              }}
            >
              <div className={styles.logLine}>
                <span
                  className={styles.timestamp}
                  style={{ color: '#666' }}
                >
                  {formatTime(log.timestamp)}
                </span>

                <span
                  className={styles.level}
                  style={{ color: LEVEL_COLORS[log.level] || '#888' }}
                >
                  [{log.level}]
                </span>

                <span
                  className={styles.category}
                  style={{ color: CATEGORY_COLORS[log.category] || '#888' }}
                >
                  {log.category}
                </span>

                {log.tool_name && (
                  <span className={styles.toolName}>{log.tool_name}</span>
                )}

                <span className={styles.title}>{log.title}</span>

                {log.status && (
                  <span
                    className={styles.status}
                    style={{
                      color:
                        log.status === 'success' ? '#00ff00' : '#ff0000',
                    }}
                  >
                    ({log.status})
                  </span>
                )}

                {log.duration_ms !== undefined && (
                  <span className={styles.duration}>
                    {log.duration_ms}ms
                  </span>
                )}
              </div>

              {/* Expanded details */}
              {expandedLogId === log.id && (
                <div className={styles.logDetails}>
                  {log.message && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Message:</span>
                      <span className={styles.detailValue}>{log.message}</span>
                    </div>
                  )}
                  {log.api_route && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Route:</span>
                      <span className={styles.detailValue}>{log.api_route}</span>
                    </div>
                  )}
                  {log.error_message && (
                    <div className={styles.detailRow}>
                      <span
                        className={styles.detailLabel}
                        style={{ color: '#ff0000' }}
                      >
                        Error:
                      </span>
                      <span
                        className={styles.detailValue}
                        style={{ color: '#ff6666' }}
                      >
                        {log.error_message}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isPaused && logs.length > 0 && (
          <div className={styles.pausedBanner}>⏸ Paused</div>
        )}
      </div>
    </div>
  );
}
