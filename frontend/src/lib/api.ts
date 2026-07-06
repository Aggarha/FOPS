'use client';

import { logger } from '@/lib/logger';
import {
  AUTH_STORAGE_KEYS,
  buildApiUrl,
  clearAuthTokens,
  getAccessToken,
  getBackendBaseUrl,
  getTenantId,
  setAuthTokens,
} from '@/lib/runtime';
import {
  ValidationError,
  asArray,
  asBoolean,
  asNumber,
  asString,
  isObject,
} from '@/lib/validation';
import { requestJson } from '@/services/http/client';

export const API_BASE = getBackendBaseUrl();

export interface User {
  id: number;
  email: string;
  role: string;
  full_name?: string;
}

export interface Permissions {
  can_approve: boolean;
  can_reject: boolean;
  can_run_tools: boolean;
  can_manage_users: boolean;
  can_view_audit: boolean;
  allowed_tools: string[];
  can_access_settings: boolean;
  can_sync_sheets: boolean;
}

export interface AuthResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
  expires_in: number;
}

export interface AuthUser {
  user: User;
  permissions: Permissions;
}

export interface Notification {
  id: number;
  message: string;
  type: 'danger' | 'warning' | 'success' | 'info';
  timestamp: string;
  read: boolean;
}

export interface CommunicationNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface CommunicationNotificationsResponse {
  notifications: CommunicationNotification[];
  unread: number;
}

export interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  count: number;
  unread: number;
}

export interface DashboardStats {
  total: number;
  singles: number;
  albums: number;
  eps: number;
  concerts: number;
  mv: number;
  lyrics_videos: number;
  ai: number;
}

export interface SheetRelease {
  date: string;
  day: string;
  eg_time: string;
  ksa_time: string;
  upc: string;
  artist: string;
  song: string;
  release_type: string;
  number_of_tracks: string;
  motion_graphics: string;
  motion_team_member: string;
  delivery_operations: string;
  delivery_motion_editing: string;
  delivery_youtube: string;
  video_type: string;
  label: string;
  distribution_type: string;
  google_drive_link: string;
  artwork_1920x1080: string;
  artwork_3000x3000: string;
  artwork_600x600: string;
  jpg_1920x1080: string;
  jpg_3000x3000: string;
  metadata_status: string;
  lyrics_status: string;
  link_anghami: string;
  link_apple: string;
  link_yango: string;
  notes: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  level: string;
  category: string;
  title: string;
  message?: string;
  tool_name?: string;
  api_route?: string;
  status?: string;
  duration_ms?: number;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface Release {
  id: number;
  artist_name: string;
  song_title: string;
  release_type: string;
  upc?: string;
  release_date?: string;
  status: string;
  artwork_link?: string;
  metadata_link?: string;
  lyrics_link?: string;
  youtube_link?: string;
  created_at?: string;
}

export interface ManagedUser {
  id: number;
  email: string;
  full_name?: string;
  role: string;
  active: boolean;
  created_at?: string;
}

export interface AppSettings {
  content_id_enabled: boolean;
  fingerprint_enabled: boolean;
  auto_pipeline_enabled: boolean;
  pipeline_interval_minutes: number;
  default_platforms: string[];
}

export interface Organization {
  id: number;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  plan: string;
  settings: Record<string, unknown>;
  active: boolean;
  created_at: string;
}

export interface OrganizationsResponse {
  orgs: Organization[];
}

export interface MyOrganizationResponse {
  org: Organization | null;
}

export interface OnlinePresenceUser {
  user_id: string | number;
  user_name?: string;
  status: string;
  current_tool?: string | null;
}

export interface OnlinePresenceResponse {
  online_users: OnlinePresenceUser[];
}

export interface ChatMessage {
  id: number;
  user_id: number;
  user_name: string;
  content: string;
  is_system?: boolean;
  created_at: string;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
}

export interface ConversationSummary {
  id: number;
  other_user_id: number;
  other_user_name: string;
  unread_count: number;
  last_message_at: string;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
}

export interface DirectMessage {
  id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  read: boolean;
  created_at: string;
}

export interface ConversationMessagesResponse {
  messages: DirectMessage[];
}

function validateSettings(value: unknown): AppSettings {
  if (!isObject(value)) throw new ValidationError('Invalid settings payload');
  return {
    content_id_enabled: asBoolean(value.content_id_enabled, 'settings.content_id_enabled'),
    fingerprint_enabled: asBoolean(value.fingerprint_enabled, 'settings.fingerprint_enabled'),
    auto_pipeline_enabled: asBoolean(value.auto_pipeline_enabled, 'settings.auto_pipeline_enabled'),
    pipeline_interval_minutes: asNumber(value.pipeline_interval_minutes, 'settings.pipeline_interval_minutes'),
    default_platforms: asArray(value.default_platforms, 'settings.default_platforms', (item) => asString(item, 'settings.default_platforms[]')),
  };
}

function validateOrganization(value: unknown): Organization {
  if (!isObject(value)) throw new ValidationError('Invalid organization payload');
  return {
    id: asNumber(value.id, 'organization.id'),
    slug: asString(value.slug, 'organization.slug'),
    name: asString(value.name, 'organization.name'),
    logo_url: value.logo_url === null || value.logo_url === undefined || value.logo_url === '' ? null : asString(value.logo_url, 'organization.logo_url'),
    primary_color: asString(value.primary_color, 'organization.primary_color'),
    plan: asString(value.plan, 'organization.plan'),
    settings: isObject(value.settings) ? value.settings : {},
    active: asBoolean(value.active, 'organization.active'),
    created_at: asString(value.created_at, 'organization.created_at'),
  };
}

function validateOrganizationsResponse(value: unknown): OrganizationsResponse {
  if (!isObject(value)) throw new ValidationError('Invalid organizations response');
  return {
    orgs: asArray(value.orgs, 'organizations.orgs', (item) => validateOrganization(item)),
  };
}

function validateMyOrganizationResponse(value: unknown): MyOrganizationResponse {
  if (!isObject(value)) throw new ValidationError('Invalid organization response');
  return {
    org: value.org === null || value.org === undefined ? null : validateOrganization(value.org),
  };
}

function validateOnlinePresenceUser(value: unknown): OnlinePresenceUser {
  if (!isObject(value)) throw new ValidationError('Invalid online user payload');
  return {
    user_id: typeof value.user_id === 'number' || typeof value.user_id === 'string' ? value.user_id : String(value.user_id),
    user_name: value.user_name === undefined || value.user_name === null ? undefined : asString(value.user_name, 'online.user_name'),
    status: asString(value.status, 'online.status'),
    current_tool: value.current_tool === undefined || value.current_tool === null ? undefined : asString(value.current_tool, 'online.current_tool'),
  };
}

function validateOnlinePresenceResponse(value: unknown): OnlinePresenceResponse {
  if (!isObject(value)) throw new ValidationError('Invalid presence response');
  return {
    online_users: asArray(value.online_users, 'presence.online_users', (item) => validateOnlinePresenceUser(item)),
  };
}

function validateChatMessage(value: unknown): ChatMessage {
  if (!isObject(value)) throw new ValidationError('Invalid chat message payload');
  return {
    id: asNumber(value.id, 'chat.id'),
    user_id: asNumber(value.user_id, 'chat.user_id'),
    user_name: asString(value.user_name, 'chat.user_name'),
    content: asString(value.content, 'chat.content'),
    is_system: value.is_system === undefined ? undefined : asBoolean(value.is_system, 'chat.is_system'),
    created_at: asString(value.created_at, 'chat.created_at'),
  };
}

function validateChatMessagesResponse(value: unknown): ChatMessagesResponse {
  if (!isObject(value)) throw new ValidationError('Invalid chat messages response');
  return {
    messages: asArray(value.messages, 'chat.messages', (item) => validateChatMessage(item)),
  };
}

function validateConversationSummary(value: unknown): ConversationSummary {
  if (!isObject(value)) throw new ValidationError('Invalid conversation payload');
  return {
    id: asNumber(value.id, 'conversation.id'),
    other_user_id: asNumber(value.other_user_id, 'conversation.other_user_id'),
    other_user_name: asString(value.other_user_name, 'conversation.other_user_name'),
    unread_count: asNumber(value.unread_count, 'conversation.unread_count'),
    last_message_at: asString(value.last_message_at, 'conversation.last_message_at'),
  };
}

function validateConversationsResponse(value: unknown): ConversationsResponse {
  if (!isObject(value)) throw new ValidationError('Invalid conversations response');
  return {
    conversations: asArray(value.conversations, 'conversations.conversations', (item) => validateConversationSummary(item)),
  };
}

function validateDirectMessage(value: unknown): DirectMessage {
  if (!isObject(value)) throw new ValidationError('Invalid direct message payload');
  return {
    id: asNumber(value.id, 'directMessage.id'),
    sender_id: asNumber(value.sender_id, 'directMessage.sender_id'),
    sender_name: asString(value.sender_name, 'directMessage.sender_name'),
    content: asString(value.content, 'directMessage.content'),
    read: asBoolean(value.read, 'directMessage.read'),
    created_at: asString(value.created_at, 'directMessage.created_at'),
  };
}

function validateConversationMessagesResponse(value: unknown): ConversationMessagesResponse {
  if (!isObject(value)) throw new ValidationError('Invalid conversation messages response');
  return {
    messages: asArray(value.messages, 'conversation.messages', (item) => validateDirectMessage(item)),
  };
}

function asOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return asString(value, field);
}

function validateUser(value: unknown): User {
  if (!isObject(value)) throw new ValidationError('Invalid user payload');
  return {
    id: asNumber(value.id, 'user.id'),
    email: asString(value.email, 'user.email'),
    role: asString(value.role, 'user.role'),
    full_name: asOptionalString(value.full_name, 'user.full_name'),
  };
}

function validatePermissions(value: unknown): Permissions {
  if (!isObject(value)) throw new ValidationError('Invalid permissions payload');
  return {
    can_approve: asBoolean(value.can_approve, 'permissions.can_approve'),
    can_reject: asBoolean(value.can_reject, 'permissions.can_reject'),
    can_run_tools: asBoolean(value.can_run_tools, 'permissions.can_run_tools'),
    can_manage_users: asBoolean(value.can_manage_users, 'permissions.can_manage_users'),
    can_view_audit: asBoolean(value.can_view_audit, 'permissions.can_view_audit'),
    allowed_tools: asArray(value.allowed_tools, 'permissions.allowed_tools', (item) => asString(item, 'permissions.allowed_tools[]')),
    can_access_settings: asBoolean(value.can_access_settings, 'permissions.can_access_settings'),
    can_sync_sheets: asBoolean(value.can_sync_sheets, 'permissions.can_sync_sheets'),
  };
}

function validateAuthResponse(value: unknown): AuthResponse {
  if (!isObject(value)) throw new ValidationError('Invalid auth response');
  return {
    success: asBoolean(value.success, 'auth.success'),
    access_token: asString(value.access_token, 'auth.access_token'),
    refresh_token: asString(value.refresh_token, 'auth.refresh_token'),
    token_type: asString(value.token_type, 'auth.token_type'),
    user: validateUser(value.user),
    expires_in: asNumber(value.expires_in, 'auth.expires_in'),
  };
}

function validateAuthUser(value: unknown): AuthUser {
  if (!isObject(value)) throw new ValidationError('Invalid current user response');
  return {
    user: validateUser(value.user),
    permissions: validatePermissions(value.permissions),
  };
}

function validateNotification(value: unknown): Notification {
  if (!isObject(value)) throw new ValidationError('Invalid notification payload');
  const type = asString(value.type, 'notification.type');
  if (!['danger', 'warning', 'success', 'info'].includes(type)) {
    throw new ValidationError('Invalid notification.type value');
  }
  return {
    id: asNumber(value.id, 'notification.id'),
    message: asString(value.message, 'notification.message'),
    type: type as Notification['type'],
    timestamp: asString(value.timestamp, 'notification.timestamp'),
    read: asBoolean(value.read, 'notification.read'),
  };
}

function validateCommunicationNotification(value: unknown): CommunicationNotification {
  if (!isObject(value)) throw new ValidationError('Invalid communication notification payload');
  return {
    id: asNumber(value.id, 'communicationNotification.id'),
    type: asString(value.type, 'communicationNotification.type'),
    title: asString(value.title, 'communicationNotification.title'),
    message: asString(value.message, 'communicationNotification.message'),
    read: asBoolean(value.read, 'communicationNotification.read'),
    created_at: asString(value.created_at, 'communicationNotification.created_at'),
  };
}

function validateNotificationsResponse(value: unknown): NotificationsResponse {
  if (!isObject(value)) throw new ValidationError('Invalid notifications response');
  return {
    success: asBoolean(value.success, 'notifications.success'),
    notifications: asArray(value.notifications, 'notifications.notifications', (item) => validateNotification(item)),
    count: asNumber(value.count, 'notifications.count'),
    unread: asNumber(value.unread, 'notifications.unread'),
  };
}

function validateCommunicationNotificationsResponse(value: unknown): CommunicationNotificationsResponse {
  if (!isObject(value)) throw new ValidationError('Invalid communications notifications response');
  return {
    notifications: asArray(value.notifications, 'communications.notifications', (item) => validateCommunicationNotification(item)),
    unread: asNumber(value.unread, 'communications.unread'),
  };
}

function validateDashboardStats(value: unknown): DashboardStats {
  if (!isObject(value)) throw new ValidationError('Invalid dashboard stats response');
  return {
    total: asNumber(value.total, 'stats.total'),
    singles: asNumber(value.singles, 'stats.singles'),
    albums: asNumber(value.albums, 'stats.albums'),
    eps: asNumber(value.eps, 'stats.eps'),
    concerts: asNumber(value.concerts, 'stats.concerts'),
    mv: asNumber(value.mv, 'stats.mv'),
    lyrics_videos: asNumber(value.lyrics_videos, 'stats.lyrics_videos'),
    ai: asNumber(value.ai, 'stats.ai'),
  };
}

function validateSheetRelease(value: unknown): SheetRelease {
  if (!isObject(value)) throw new ValidationError('Invalid sheet release payload');
  return {
    date: asString(value.date ?? '', 'release.date'),
    day: asString(value.day ?? '', 'release.day'),
    eg_time: asString(value.eg_time ?? '', 'release.eg_time'),
    ksa_time: asString(value.ksa_time ?? '', 'release.ksa_time'),
    upc: asString(value.upc ?? '', 'release.upc'),
    artist: asString(value.artist ?? '', 'release.artist'),
    song: asString(value.song ?? '', 'release.song'),
    release_type: asString(value.release_type ?? '', 'release.release_type'),
    number_of_tracks: asString(value.number_of_tracks ?? '', 'release.number_of_tracks'),
    motion_graphics: asString(value.motion_graphics ?? '', 'release.motion_graphics'),
    motion_team_member: asString(value.motion_team_member ?? '', 'release.motion_team_member'),
    delivery_operations: asString(value.delivery_operations ?? '', 'release.delivery_operations'),
    delivery_motion_editing: asString(value.delivery_motion_editing ?? '', 'release.delivery_motion_editing'),
    delivery_youtube: asString(value.delivery_youtube ?? '', 'release.delivery_youtube'),
    video_type: asString(value.video_type ?? '', 'release.video_type'),
    label: asString(value.label ?? '', 'release.label'),
    distribution_type: asString(value.distribution_type ?? '', 'release.distribution_type'),
    google_drive_link: asString(value.google_drive_link ?? '', 'release.google_drive_link'),
    artwork_1920x1080: asString(value.artwork_1920x1080 ?? '', 'release.artwork_1920x1080'),
    artwork_3000x3000: asString(value.artwork_3000x3000 ?? '', 'release.artwork_3000x3000'),
    artwork_600x600: asString(value.artwork_600x600 ?? '', 'release.artwork_600x600'),
    jpg_1920x1080: asString(value.jpg_1920x1080 ?? '', 'release.jpg_1920x1080'),
    jpg_3000x3000: asString(value.jpg_3000x3000 ?? '', 'release.jpg_3000x3000'),
    metadata_status: asString(value.metadata_status ?? '', 'release.metadata_status'),
    lyrics_status: asString(value.lyrics_status ?? '', 'release.lyrics_status'),
    link_anghami: asString(value.link_anghami ?? '', 'release.link_anghami'),
    link_apple: asString(value.link_apple ?? '', 'release.link_apple'),
    link_yango: asString(value.link_yango ?? '', 'release.link_yango'),
    notes: asString(value.notes ?? '', 'release.notes'),
  };
}

function validateRelease(value: unknown): Release {
  if (!isObject(value)) throw new ValidationError('Invalid release payload');
  return {
    id: asNumber(value.id, 'timelineRelease.id'),
    artist_name: asString(value.artist_name, 'timelineRelease.artist_name'),
    song_title: asString(value.song_title, 'timelineRelease.song_title'),
    release_type: asString(value.release_type, 'timelineRelease.release_type'),
    upc: asOptionalString(value.upc, 'timelineRelease.upc'),
    release_date: asOptionalString(value.release_date, 'timelineRelease.release_date'),
    status: asString(value.status, 'timelineRelease.status'),
    artwork_link: asOptionalString(value.artwork_link, 'timelineRelease.artwork_link'),
    metadata_link: asOptionalString(value.metadata_link, 'timelineRelease.metadata_link'),
    lyrics_link: asOptionalString(value.lyrics_link, 'timelineRelease.lyrics_link'),
    youtube_link: asOptionalString(value.youtube_link, 'timelineRelease.youtube_link'),
    created_at: asOptionalString(value.created_at, 'timelineRelease.created_at'),
  };
}

function validateManagedUser(value: unknown): ManagedUser {
  if (!isObject(value)) throw new ValidationError('Invalid managed user payload');
  return {
    id: asNumber(value.id, 'managedUser.id'),
    email: asString(value.email, 'managedUser.email'),
    full_name: asOptionalString(value.full_name, 'managedUser.full_name'),
    role: asString(value.role, 'managedUser.role'),
    active: asBoolean(value.active, 'managedUser.active'),
    created_at: asOptionalString(value.created_at, 'managedUser.created_at'),
  };
}

function validateAuditLog(value: unknown): AuditLog {
  if (!isObject(value)) throw new ValidationError('Invalid audit log payload');
  return {
    id: asNumber(value.id, 'audit.id'),
    timestamp: asString(value.timestamp, 'audit.timestamp'),
    level: asString(value.level, 'audit.level'),
    category: asString(value.category, 'audit.category'),
    title: asString(value.title, 'audit.title'),
    message: asOptionalString(value.message, 'audit.message'),
    tool_name: asOptionalString(value.tool_name, 'audit.tool_name'),
    api_route: asOptionalString(value.api_route, 'audit.api_route'),
    status: asOptionalString(value.status, 'audit.status'),
    duration_ms: value.duration_ms === undefined || value.duration_ms === null ? undefined : asNumber(value.duration_ms, 'audit.duration_ms'),
  };
}

function validateAuditLogsResponse(value: unknown): AuditLogsResponse {
  if (!isObject(value)) throw new ValidationError('Invalid audit logs response');
  return {
    logs: asArray(value.logs, 'audit.logs', (item) => validateAuditLog(item)),
    total: asNumber(value.total, 'audit.total'),
    limit: asNumber(value.limit, 'audit.limit'),
    offset: asNumber(value.offset, 'audit.offset'),
  };
}

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(AUTH_STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return validateUser(JSON.parse(raw));
  } catch (error) {
    logger.warn('Discarding invalid stored user payload', { scope: 'api', operation: 'getStoredUser' }, error);
    localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function getUser(): User | null {
  return getStoredUser();
}

function buildRequestHeaders(options: RequestInit = {}): HeadersInit {
  const token = getAccessToken();
  const tenantId = getTenantId();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  headers['X-FOPS-Client'] = 'dashboard-web';

  return headers;
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const finalUrl = /^https?:\/\//i.test(url) ? url : buildApiUrl(url);
  const response = await fetch(finalUrl, {
    ...options,
    headers: buildRequestHeaders(options),
    cache: 'no-store',
  });

  if (response.status === 401) {
    clearAuthTokens();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  return response;
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = isObject(data) && data.detail ? String(data.detail) : `API error ${response.status}`;
    throw new Error(detail);
  }
  return data as T;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await requestJson('/api/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
    validator: validateAuthResponse,
  });

  setAuthTokens(data.access_token, data.refresh_token);
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(data.user));
  }

  return data;
}

export async function logout(): Promise<void> {
  clearAuthTokens();
}

export async function getCurrentUser(): Promise<AuthUser> {
  const data = await requestJson('/api/auth/me', { validator: validateAuthUser });
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(data.user));
  }
  return data;
}

export async function fetchStats(): Promise<DashboardStats> {
  return requestJson('/api/dashboard/stats', { auth: false, validator: validateDashboardStats });
}

export async function fetchSheetReleases(): Promise<SheetRelease[]> {
  return requestJson('/api/releases/from-sheet', {
    auth: false,
    validator: (value) => asArray(value, 'sheetReleases', (item) => validateSheetRelease(item)),
  });
}

export async function audioMatch(
  song: string,
  artist: string,
  options?: {
    platforms?: string[];
    use_fingerprint?: boolean;
    reference_url?: string;
    channel_filter?: string;
  }
): Promise<any> {
  return requestJson('/api/tools/audio-match', {
    method: 'POST',
    body: {
      song,
      artist,
      platforms: options?.platforms || ['youtube'],
      use_fingerprint: options?.use_fingerprint ?? true,
      reference_url: options?.reference_url,
      channel_filter: options?.channel_filter,
    },
  });
}

export async function youtubeSearch(
  song: string,
  artist: string,
  mode: 'basic' | 'advanced' = 'advanced'
): Promise<any> {
  const params = new URLSearchParams({ song, artist, mode });
  return requestJson(`/api/tools/youtube-search?${params.toString()}`);
}

export async function approveDecision(
  song: string,
  artist: string,
  best_match: string,
  confidence: number,
  reason?: string
): Promise<any> {
  return requestJson('/api/actions/approve', {
    method: 'POST',
    body: { song, artist, best_match, confidence, reason: reason || '' },
  });
}

export async function rejectDecision(song: string, artist: string, reason?: string): Promise<any> {
  return requestJson('/api/actions/reject', {
    method: 'POST',
    body: { song, artist, reason: reason || '' },
  });
}

export async function getDecisions(limit: number = 50, filter?: 'approved' | 'rejected'): Promise<any> {
  const params = new URLSearchParams({ limit: limit.toString(), filter: filter || '' });
  return requestJson(`/api/actions/decisions?${params.toString()}`);
}

export async function channelScrape(
  channelUrl: string,
  maxResults: number = 100,
  exportFormat: string = 'json'
): Promise<any> {
  return requestJson('/api/tools/channel-scrape', {
    method: 'POST',
    body: { channel_url: channelUrl, max_results: maxResults, export_format: exportFormat },
  });
}

export async function discoverSong(
  artist: string,
  song: string,
  maxResults: number = 50,
  isrc?: string,
  upc?: string
): Promise<any> {
  return requestJson('/api/tools/discover', {
    method: 'POST',
    body: { artist, song, max_results: maxResults, isrc, upc },
  });
}

export async function discoverBatch(
  items: Array<{ artist: string; song: string; isrc?: string; upc?: string }>,
  maxResultsPer: number = 30,
  maxThreads: number = 3
): Promise<any> {
  return requestJson('/api/tools/discover/batch', {
    method: 'POST',
    body: { items, max_results_per: maxResultsPer, max_threads: maxThreads },
  });
}

export async function scrapeChannel(
  channelUrl: string,
  maxResults: number = 0,
  includeShorts: boolean = true,
  includeLive: boolean = true
): Promise<any> {
  return requestJson('/api/tools/scrape/channel', {
    method: 'POST',
    body: {
      channel_url: channelUrl,
      max_results: maxResults,
      include_shorts: includeShorts,
      include_live: includeLive,
    },
  });
}

export async function compareAudioFingerprint(
  referenceUrl: string,
  candidateUrl: string,
  sampleDuration: number = 30,
  sampleOffset: number = 10
): Promise<any> {
  return requestJson('/api/tools/fingerprint/compare-audio', {
    method: 'POST',
    body: {
      reference_url: referenceUrl,
      candidate_url: candidateUrl,
      sample_duration: sampleDuration,
      sample_offset: sampleOffset,
    },
  });
}

export async function generateFingerprint(url: string, duration: number = 45, offset: number = 10): Promise<any> {
  return requestJson('/api/tools/fingerprint/generate', {
    method: 'POST',
    body: { url, duration, offset },
  });
}

export async function parseBatchUpload(file: File): Promise<any> {
  const formData = new FormData();
  const token = getAccessToken();
  const tenantId = getTenantId();

  formData.append('file', file);

  const headers: Record<string, string> = {
    'X-FOPS-Client': 'dashboard-web',
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  const res = await fetch(buildApiUrl('/api/tools/batch/parse-upload'), {
    method: 'POST',
    headers,
    body: formData,
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(isObject(data) && data.detail ? String(data.detail) : 'Upload failed');
  }

  return data;
}

export async function exportBatchXlsx(
  items: Array<{ artist: string; song: string }>,
  maxResultsPer: number = 30
): Promise<Blob> {
  const token = getAccessToken();
  const tenantId = getTenantId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-FOPS-Client': 'dashboard-web',
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  const res = await fetch(buildApiUrl('/api/tools/batch/export-xlsx'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ items, max_results_per: maxResultsPer, max_threads: 3 }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(isObject(data) && data.detail ? String(data.detail) : 'Export failed');
  }

  return res.blob();
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  return requestJson('/api/notifications', { validator: validateNotificationsResponse });
}

export async function fetchCommunicationNotifications(): Promise<CommunicationNotificationsResponse> {
  return requestJson('/api/communications/notifications?limit=30', { validator: validateCommunicationNotificationsResponse });
}

export async function markNotificationsAsRead(): Promise<any> {
  return requestJson('/api/notifications/read', { method: 'POST' });
}

export async function markCommunicationNotificationsAsRead(): Promise<any> {
  return requestJson('/api/communications/notifications/read-all', { method: 'POST' });
}

export async function markNotificationRead(id: number): Promise<any> {
  return requestJson(`/api/notifications/read/${id}`, { method: 'POST' });
}

export async function markCommunicationNotificationRead(id: number): Promise<any> {
  return requestJson(`/api/communications/notifications/${id}/read`, { method: 'POST' });
}

export async function deleteNotification(id: number): Promise<any> {
  return requestJson(`/api/notifications/${id}`, { method: 'DELETE' });
}

export async function fetchSettings(): Promise<AppSettings> {
  return requestJson('/api/settings', { validator: validateSettings });
}

export async function saveSettings(settings: AppSettings): Promise<{ settings: AppSettings }> {
  return requestJson('/api/settings', {
    method: 'POST',
    body: settings,
    validator: (value) => {
      if (!isObject(value)) throw new ValidationError('Invalid settings save response');
      return { settings: validateSettings(value.settings) };
    },
  });
}

export async function fetchOrganizations(): Promise<OrganizationsResponse> {
  return requestJson('/api/orgs', { validator: validateOrganizationsResponse });
}

export async function fetchMyOrganization(): Promise<MyOrganizationResponse> {
  return requestJson('/api/orgs/mine', { validator: validateMyOrganizationResponse });
}

export async function createOrganization(data: {
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  plan: string;
}): Promise<Organization> {
  return requestJson('/api/orgs', {
    method: 'POST',
    body: data,
    validator: validateOrganization,
  });
}

export async function updateOrganization(id: number, data: {
  name: string;
  logo_url: string | null;
  primary_color: string;
  plan: string;
}): Promise<Organization> {
  return requestJson(`/api/orgs/${id}`, {
    method: 'PATCH',
    body: data,
    validator: validateOrganization,
  });
}

export async function deleteOrganization(id: number): Promise<void> {
  await requestJson(`/api/orgs/${id}`, { method: 'DELETE' });
}

export async function fetchOnlinePresence(): Promise<OnlinePresenceResponse> {
  return requestJson('/api/communications/presence/online', { validator: validateOnlinePresenceResponse });
}

export async function fetchGlobalChatMessages(limit: number = 100): Promise<ChatMessagesResponse> {
  return requestJson(`/api/communications/chat/messages?limit=${limit}`, { validator: validateChatMessagesResponse });
}

export async function sendGlobalChatMessage(content: string): Promise<{ message: ChatMessage }> {
  return requestJson('/api/communications/chat/messages', {
    method: 'POST',
    body: { content },
    validator: (value) => {
      if (!isObject(value)) throw new ValidationError('Invalid chat send response');
      return { message: validateChatMessage(value.message) };
    },
  });
}

export async function fetchConversations(): Promise<ConversationsResponse> {
  return requestJson('/api/communications/conversations', { validator: validateConversationsResponse });
}

export async function fetchConversationMessages(otherUserId: number): Promise<ConversationMessagesResponse> {
  return requestJson(`/api/communications/conversations/${otherUserId}/messages`, { validator: validateConversationMessagesResponse });
}

export async function sendConversationMessage(otherUserId: number, content: string): Promise<{ message: DirectMessage }> {
  return requestJson(`/api/communications/conversations/${otherUserId}/messages`, {
    method: 'POST',
    body: { content },
    validator: (value) => {
      if (!isObject(value)) throw new ValidationError('Invalid conversation send response');
      return { message: validateDirectMessage(value.message) };
    },
  });
}

export async function fetchAuditLogs(params?: {
  level?: string;
  category?: string;
  tool_name?: string;
  status?: string;
  hours?: number;
  limit?: number;
  offset?: number;
}): Promise<AuditLogsResponse> {
  const q = new URLSearchParams();
  if (params?.level) q.set('level', params.level);
  if (params?.category) q.set('category', params.category);
  if (params?.tool_name) q.set('tool_name', params.tool_name);
  if (params?.status) q.set('status', params.status);
  if (params?.hours !== undefined) q.set('hours', String(params.hours));
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));

  return requestJson(`/api/logs?${q.toString()}`, { validator: validateAuditLogsResponse });
}

export async function fetchReleases(): Promise<Release[]> {
  return requestJson('/api/releases', {
    validator: (value) => asArray(value, 'releases', (item) => validateRelease(item)),
  });
}

export async function updateRelease(id: number, data: Partial<Release>): Promise<Release> {
  return requestJson(`/api/releases/${id}`, {
    method: 'PATCH',
    body: data,
    validator: validateRelease,
  });
}

export async function fetchUsers(): Promise<ManagedUser[]> {
  return requestJson('/api/users', {
    validator: (value) => asArray(value, 'managedUsers', (item) => validateManagedUser(item)),
  });
}

export async function createUser(data: { email: string; password: string; full_name?: string; role: string }): Promise<ManagedUser> {
  return requestJson('/api/users', {
    method: 'POST',
    body: data,
    validator: validateManagedUser,
  });
}

export async function updateUser(id: number, data: { role?: string; active?: boolean; full_name?: string }): Promise<ManagedUser> {
  return requestJson(`/api/users/${id}`, {
    method: 'PATCH',
    body: data,
    validator: validateManagedUser,
  });
}

export async function deleteUser(id: number): Promise<void> {
  await requestJson(`/api/users/${id}`, { method: 'DELETE' });
}
