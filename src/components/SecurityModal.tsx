import { useState, useEffect, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Shield,
  Laptop,
  Smartphone,
  Key,
  Trash2,
  LogOut,
  CheckCircle2,
  Clock,
  Globe,
  Plus,
  RefreshCw,
  X,
  Fingerprint,
  Pencil,
  Check,
  Activity,
  AlertTriangle,
  AlertOctagon,
  Sparkles,
  Database,
  Usb,
  FileSpreadsheet,
  FileJson,
  Bell,
  Mail,
  Send,
  Cpu,
  Info,
  ShieldCheck,
  Eye,
  EyeOff,
  History,
  Printer,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../i18n/index.ts';

import type { LocalUserConfig, SessionInfo, PasskeyInfo, AuditLogItem, VaultItem, VaultSnapshotInfo } from '../types/vault';
import type { ApiResponse } from '../worker/types';
import {
  registerPasskey,
  wrapMasterKey,
  checkWebAuthnSupport,
} from '../lib/crypto/webauthn';
import { saveUserConfig, getUserConfig, updateSessionToken, saveLocalVault } from '../lib/storage/idb';
import { evaluateVaultHygiene } from '../lib/security/vaultHygiene';
import { checkPasswordPwned } from '../lib/security/pwnedCheck';
import { deriveMasterKey, generateSalt } from '../lib/crypto/kdf';
import { encryptVault } from '../lib/crypto/vault';
import { pullRemoteVault } from '../lib/sync/syncEngine';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  sessionToken?: string;
  userConfig: LocalUserConfig | null;
  masterKey: CryptoKey | null;
  onConfigUpdated: (config: LocalUserConfig) => void;
  items?: VaultItem[];
  onOpenBackup?: () => void;
  onOpenEmergencyKit?: () => void;
  onVaultRestored?: (items: VaultItem[], newVersion: number) => void;
  onSelectAccount?: (item: VaultItem) => void;
}

export function SecurityModal({
  isOpen,
  onClose,
  userId,
  sessionToken,
  userConfig,
  masterKey,
  onConfigUpdated,
  items = [],
  onOpenBackup,
  onOpenEmergencyKit,
  onVaultRestored,
  onSelectAccount,
}: SecurityModalProps) {
  const { t, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState<'health' | 'sessions' | 'passkeys' | 'notifications' | 'audit' | 'snapshots'>('health');


  // Vault Hygiene & Diagnostics
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(() => {
    const stored = localStorage.getItem('revolt_last_backup');
    return stored ? parseInt(stored, 10) : null;
  });

  useEffect(() => {
    const handleBackupUpdated = () => {
      const stored = localStorage.getItem('revolt_last_backup');
      setLastBackupAt(stored ? parseInt(stored, 10) : null);
    };
    window.addEventListener('revolt:backup-updated', handleBackupUpdated);
    return () => window.removeEventListener('revolt:backup-updated', handleBackupUpdated);
  }, []);

  const healthScore = useMemo(() => {
    return evaluateVaultHygiene(items, lastBackupAt);
  }, [items, lastBackupAt]);

  // Leak checker state (HaveIBeenPwned via k-Anonymity)
  const [leakInput, setLeakInput] = useState('');
  const [isCheckingLeak, setIsCheckingLeak] = useState(false);
  const [leakResult, setLeakResult] = useState<{ checked: boolean; compromised: boolean; count: number } | null>(null);

  const handleCheckLeak = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = leakInput.trim();
    if (!query) return;
    setIsCheckingLeak(true);
    setLeakResult(null);
    try {
      const res = await checkPasswordPwned(query);
      setLeakResult({ checked: true, compromised: res.compromised, count: res.count });
    } catch (err) {
      console.error('Failed to query pwned check:', err);
      toast.error(t('toasts.leakCheckError'));
    } finally {
      setIsCheckingLeak(false);
    }
  };

  // Sessions state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [isSavingSessionName, setIsSavingSessionName] = useState(false);

  // Passkeys state
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(false);
  const [isEnrollingPasskey, setIsEnrollingPasskey] = useState(false);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [enrollAttachment, setEnrollAttachment] = useState<'platform' | 'cross-platform'>('platform');
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState('');
  const [isSavingPasskeyName, setIsSavingPasskeyName] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Push Notification state
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isLoadingPush, setIsLoadingPush] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // Email Notification & BYOK settings
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailProvider, setEmailProvider] = useState<'resend' | 'cloudflare'>('resend');
  const [resendApiKey, setResendApiKey] = useState('');
  const [hasStoredResendKey, setHasStoredResendKey] = useState(false);
  const [showResendKey, setShowResendKey] = useState(false);
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [destinationEmail, setDestinationEmail] = useState('');
  const [notifyNewCountry, setNotifyNewCountry] = useState(true);
  const [notifyNewSession, setNotifyNewSession] = useState(true);
  const [notifyPasskeyAdded, setNotifyPasskeyAdded] = useState(true);
  const [notifySessionRevoked, setNotifySessionRevoked] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  // KDF Upgrade State
  const [kdfUpgradePassword, setKdfUpgradePassword] = useState('');
  const [isUpgradingKdf, setIsUpgradingKdf] = useState(false);
  const [showUpgradePassword, setShowUpgradePassword] = useState(false);


  // Helper to reliably obtain the latest session token from IndexedDB (or fallback to prop)
  const getActiveToken = useCallback(async (): Promise<string | undefined> => {
    try {
      const cfg = await getUserConfig();
      return cfg?.session_token || sessionToken;
    } catch {
      return sessionToken;
    }
  }, [sessionToken]);

  // ---------------------------------------------------------------------------
  // Data Fetching: Sessions
  // ---------------------------------------------------------------------------
  const fetchSessions = useCallback(async () => {
    if (!userId) return;
    setIsLoadingSessions(true);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch('/api/sessions', { headers });
      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) {
        await updateSessionToken(newTok);
      }

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Sesión no autorizada o revocada en el servidor');
        }
        throw new Error('Error al consultar sesiones activas');
      }

      const data = (await res.json()) as ApiResponse<{ sessions: SessionInfo[] }>;
      if (data.success && data.data?.sessions) {
        setSessions(data.data.sessions);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar sesiones';
      toast.error(msg);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [userId, getActiveToken]);

  // ---------------------------------------------------------------------------
  // Data Fetching: Passkeys
  // ---------------------------------------------------------------------------
  const fetchPasskeys = useCallback(async () => {
    if (!userId) return;
    setIsLoadingPasskeys(true);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch('/api/passkeys', { headers });
      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) {
        await updateSessionToken(newTok);
      }

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Sesión no autorizada o revocada');
        }
        throw new Error('Error al consultar passkeys vinculadas');
      }

      const data = (await res.json()) as ApiResponse<{ passkeys: PasskeyInfo[] }>;
      if (data.success && data.data?.passkeys) {
        let list = data.data.passkeys;

        // If this device holds a local Windows Hello passkey that is not in the remote list,
        // display it immediately and sync it with the remote server in the background.
        if (userConfig?.webauthn_credential_id) {
          const localCredId = userConfig.webauthn_credential_id;
          const exists = list.some((p) => p.id === localCredId);
          if (!exists) {
            const pkName = userConfig.passkey_name || 'Windows Hello / Este dispositivo';
            const devName = userConfig.device_name || 'Windows · Chrome';
            const localPasskey: PasskeyInfo = {
              id: localCredId,
              user_id: userId,
              name: pkName,
              device_name: devName,
              created_at: Math.floor(Date.now() / 1000),
              last_used_at: Math.floor(Date.now() / 1000),
              is_revoked: 0,
            };
            list = [localPasskey, ...list];

            // Auto-enroll on server in background
            fetch('/api/passkeys', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                ...(activeToken ? { 'X-Session-Token': activeToken } : {}),
              },
              body: JSON.stringify({
                credential_id: localCredId,
                name: pkName,
              }),
            }).catch(() => {});
          }
        }

        setPasskeys(list);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar passkeys';
      toast.error(msg);
    } finally {
      setIsLoadingPasskeys(false);
    }
  }, [userId, getActiveToken, userConfig]);

  // ---------------------------------------------------------------------------
  // Data Fetching: Audit Logs
  // ---------------------------------------------------------------------------
  const fetchAuditLogs = useCallback(async () => {
    if (!userId) return;
    setIsLoadingAudit(true);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch('/api/audit', { headers });
      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) {
        await updateSessionToken(newTok);
      }

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Sesión no autorizada o expirada');
        }
        throw new Error('Error al consultar historial de seguridad');
      }

      const data = (await res.json()) as ApiResponse<{ audit_logs: AuditLogItem[] }>;
      if (data.success && data.data?.audit_logs) {
        setAuditLogs(data.data.audit_logs);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar registros';
      toast.error(msg);
    } finally {
      setIsLoadingAudit(false);
    }
  }, [userId, getActiveToken]);

  // Check Web Push subscription and browser support
  const checkPushStatus = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushPermission('unsupported');
      return;
    }
    setPushPermission(Notification.permission);
    if (Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsPushSubscribed(!!sub);
      } catch {
        setIsPushSubscribed(false);
      }
    } else {
      setIsPushSubscribed(false);
    }
  }, []);

  // Fetch notification preferences from server
  const fetchNotificationSettings = useCallback(async () => {
    if (!userId) return;
    setIsLoadingSettings(true);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = { 'X-User-Id': userId };
      if (activeToken) headers['X-Session-Token'] = activeToken;

      const res = await fetch('/api/notifications/settings', { headers });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<{
          push_enabled?: boolean;
          email_enabled?: boolean;
          email_provider?: 'resend' | 'cloudflare';
          has_resend_api_key?: boolean;
          resend_from_email?: string;
          destination_email?: string;
          notify_new_country?: boolean;
          notify_new_session?: boolean;
          notify_passkey_added?: boolean;
          notify_session_revoked?: boolean;
        }>;
        if (json.success && json.data) {
          setPushEnabled(json.data.push_enabled ?? true);
          setEmailEnabled(json.data.email_enabled ?? false);
          setEmailProvider(json.data.email_provider || 'resend');
          setHasStoredResendKey(!!json.data.has_resend_api_key);
          setResendFromEmail(json.data.resend_from_email || '');
          setDestinationEmail(json.data.destination_email || '');
          setNotifyNewCountry(json.data.notify_new_country ?? true);
          setNotifyNewSession(json.data.notify_new_session ?? true);
          setNotifyPasskeyAdded(json.data.notify_passkey_added ?? true);
          setNotifySessionRevoked(json.data.notify_session_revoked ?? true);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingSettings(false);
    }
  }, [userId, getActiveToken]);

  // Snapshots (Vault History) State
  const [snapshots, setSnapshots] = useState<VaultSnapshotInfo[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const fetchSnapshots = useCallback(async () => {
    if (!userId) return;
    setIsLoadingSnapshots(true);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = { 'X-User-Id': userId };
      if (activeToken) headers['X-Session-Token'] = activeToken;

      const res = await fetch('/api/vault/snapshots', { headers });
      const newTok = res.headers?.get?.('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) {
        throw new Error('Error al consultar historial de snapshots');
      }

      const data = (await res.json()) as ApiResponse<VaultSnapshotInfo[]>;
      if (data.success && Array.isArray(data.data)) {
        setSnapshots(data.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar snapshots';
      toast.error(msg);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [userId, getActiveToken]);

  const handleRestoreSnapshot = async (version: number) => {
    if (!userId) return;
    const confirmMsg = t('snapshots.restoreConfirm', { version }) || `¿Restaurar la bóveda a la versión ${version}?`;
    if (!window.confirm(confirmMsg)) return;

    setRestoringVersion(version);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = { 'X-User-Id': userId };
      if (activeToken) headers['X-Session-Token'] = activeToken;

      const res = await fetch(`/api/vault/restore/${version}`, {
        method: 'POST',
        headers,
      });

      const newTok = res.headers?.get?.('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) {
        throw new Error(`Error al restaurar snapshot: HTTP ${res.status}`);
      }

      // Synchronize remote vault locally
      if (masterKey) {
        const pulled = await pullRemoteVault('', masterKey);
        if (pulled.items) {
          onVaultRestored?.(pulled.items, pulled.version || version + 1);
        }
      }

      toast.success(t('snapshots.restoreSuccess', { version }) || `Bóveda restaurada a versión ${version}`);
      await fetchSnapshots();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al restaurar snapshot';
      toast.error(msg);
    } finally {
      setRestoringVersion(null);
    }
  };

  // Trigger loads on modal open or tab change
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'sessions') {
      fetchSessions();
    } else if (activeTab === 'passkeys') {
      fetchPasskeys();
    } else if (activeTab === 'notifications') {
      checkPushStatus();
      fetchNotificationSettings();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'snapshots') {
      fetchSnapshots();
    }
  }, [isOpen, activeTab, fetchSessions, fetchPasskeys, fetchAuditLogs, fetchSnapshots, checkPushStatus, fetchNotificationSettings]);

  // Handlers for Web Push
  const handleSubscribePush = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      toast.error(t('security.pushStatusUnsupported'));
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm !== 'granted') {
        toast.error(t('security.pushStatusDeniedHelp'));
        return;
      }

      setIsLoadingPush(true);
      const resKey = await fetch('/api/notifications/vapid-public-key');
      const jsonKey = (await resKey.json()) as ApiResponse<{ public_key: string }>;
      if (!jsonKey.success || !jsonKey.data?.public_key) {
        throw new Error('No se pudo obtener la clave VAPID');
      }

      // Base64URL decode to Uint8Array
      const padding = '='.repeat((4 - (jsonKey.data.public_key.length % 4)) % 4);
      const b64 = (jsonKey.data.public_key + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(b64);
      const appServerKey = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) appServerKey[i] = raw.charCodeAt(i);

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      }

      const p256dhBytes = new Uint8Array(sub.getKey('p256dh') || new ArrayBuffer(0));
      const authBytes = new Uint8Array(sub.getKey('auth') || new ArrayBuffer(0));

      let p256dhStr = '';
      for (let i = 0; i < p256dhBytes.byteLength; i++) p256dhStr += String.fromCharCode(p256dhBytes[i]);
      const p256dh = btoa(p256dhStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      let authStr = '';
      for (let i = 0; i < authBytes.byteLength; i++) authStr += String.fromCharCode(authBytes[i]);
      const auth = btoa(authStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const activeToken = await getActiveToken();
      const subRes = await fetch('/api/notifications/push-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          ...(activeToken ? { 'X-Session-Token': activeToken } : {}),
        },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh,
          auth,
        }),
      });

      const subJson = (await subRes.json()) as ApiResponse<{ message?: string; subscribed?: boolean }>;
      if (!subJson.success) {
        throw new Error(subJson.error?.message || 'Error registrando suscripción');
      }

      setIsPushSubscribed(true);
      toast.success('¡Alertas push activadas exitosamente!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error activando push';
      toast.error(msg);
    } finally {
      setIsLoadingPush(false);
    }
  };

  const handleUnsubscribePush = async () => {
    setIsLoadingPush(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        const activeToken = await getActiveToken();
        await fetch('/api/notifications/push-unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            ...(activeToken ? { 'X-Session-Token': activeToken } : {}),
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setIsPushSubscribed(false);
      toast.success(t('security.pushStatusInactive'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desactivando push';
      toast.error(msg);
    } finally {
      setIsLoadingPush(false);
    }
  };

  const handleTestPush = async () => {
    setIsTestingPush(true);
    try {
      const activeToken = await getActiveToken();
      const res = await fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
          ...(activeToken ? { 'X-Session-Token': activeToken } : {}),
        },
      });
      const json = (await res.json()) as ApiResponse<{ message?: string }>;
      if (json.success) {
        toast.success(t('security.testPushSuccess'));
      } else {
        toast.error(json.error?.message || 'Error en prueba push');
      }
    } catch {
      toast.error('Error enviando notificación de prueba');
    } finally {
      setIsTestingPush(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    setIsSavingSettings(true);
    try {
      const activeToken = await getActiveToken();
      const res = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          ...(activeToken ? { 'X-Session-Token': activeToken } : {}),
        },
        body: JSON.stringify({
          push_enabled: pushEnabled,
          email_enabled: emailEnabled,
          email_provider: emailProvider,
          resend_api_key: resendApiKey.trim() || undefined,
          resend_from_email: resendFromEmail.trim() || undefined,
          destination_email: destinationEmail.trim() || undefined,
          notify_new_country: notifyNewCountry,
          notify_new_session: notifyNewSession,
          notify_passkey_added: notifyPasskeyAdded,
          notify_session_revoked: notifySessionRevoked,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ message?: string }>;
      if (json.success) {
        if (resendApiKey.trim()) {
          setHasStoredResendKey(true);
          setResendApiKey('');
        }
        toast.success(t('security.settingsSaved'));
      } else {
        toast.error(json.error?.message || 'Error al guardar configuración');
      }
    } catch {
      toast.error('Error al guardar configuración');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTestEmail = async () => {
    if (!destinationEmail || !destinationEmail.includes('@')) {
      toast.error(t('security.emailDestinationPlaceholder'));
      return;
    }
    setIsTestingEmail(true);
    try {
      const activeToken = await getActiveToken();
      const res = await fetch('/api/notifications/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          ...(activeToken ? { 'X-Session-Token': activeToken } : {}),
        },
        body: JSON.stringify({
          provider: emailProvider,
          destination_email: destinationEmail.trim(),
          resend_api_key: resendApiKey.trim() || undefined,
          resend_from_email: resendFromEmail.trim() || undefined,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ message?: string }>;
      if (json.success) {
        toast.success(t('security.testEmailSuccess'));
      } else {
        toast.error(json.error?.message || t('security.testEmailFailed'));
      }
    } catch {
      toast.error(t('security.testEmailFailed'));
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleUpgradeKdfManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kdfUpgradePassword) {
      toast.error('Debes ingresar tu contraseña maestra actual');
      return;
    }
    if (!userConfig) {
      toast.error('Configuración de usuario no encontrada');
      return;
    }
    setIsUpgradingKdf(true);
    try {
      const newSaltBytes = generateSalt(16);
      let binarySalt = '';
      for (let i = 0; i < newSaltBytes.length; i++) binarySalt += String.fromCharCode(newSaltBytes[i]);
      const newSaltBase64 = btoa(binarySalt);

      const newMasterKey = await deriveMasterKey(kdfUpgradePassword, newSaltBytes, {
        algorithm: 'argon2id',
        iterations: 3,
        memorySize: 65536,
      });

      const encrypted = await encryptVault(items, newMasterKey);

      const activeToken = await getActiveToken();
      const res = await fetch('/api/auth/upgrade-kdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          ...(activeToken ? { 'X-Session-Token': activeToken } : {}),
        },
        body: JSON.stringify({
          kdf_salt: newSaltBase64,
          kdf_algorithm: 'argon2id',
          encrypted_blob: encrypted.encryptedBlob,
          iv: encrypted.iv,
        }),
      });

      const json = (await res.json()) as ApiResponse<{ message?: string }>;
      if (!json.success) {
        throw new Error(json.error?.message || 'Error al actualizar algoritmo en el servidor');
      }

      let updatedWrappedKey = userConfig.wrapped_master_key;
      if (userConfig.webauthn_credential_id) {
        try {
          const newPkg = await wrapMasterKey(newMasterKey, userConfig.webauthn_credential_id);
          updatedWrappedKey = JSON.stringify(newPkg);
        } catch (wrapErr) {
          console.warn('Failed to re-wrap master key with passkey:', wrapErr);
        }
      }

      const updatedConfig: LocalUserConfig = {
        ...userConfig,
        kdf_salt: newSaltBase64,
        kdf_algorithm: 'argon2id',
        wrapped_master_key: updatedWrappedKey,
      };
      await saveUserConfig(updatedConfig);
      await saveLocalVault({
        user_id: userId,
        encrypted_blob: encrypted.encryptedBlob,
        iv: encrypted.iv,
        version: encrypted.version,
        updated_at: encrypted.updatedAt,
        sync_status: 'synced',
      });
      onConfigUpdated(updatedConfig);

      setKdfUpgradePassword('');
      toast.success(t('security.kdfUpgradeSuccess'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar a Argon2id';
      toast.error(msg);
    } finally {
      setIsUpgradingKdf(false);
    }
  };


  // ---------------------------------------------------------------------------
  // Action Handlers: Sessions
  // ---------------------------------------------------------------------------
  const handleStartEditSession = (session: SessionInfo) => {
    setEditingSessionId(session.id);
    setEditingSessionName(session.device_name || '');
  };

  const handleCancelEditSession = () => {
    setEditingSessionId(null);
    setEditingSessionName('');
  };

  const handleSaveEditSession = async (sessionId: string) => {
    const trimmed = editingSessionName.trim();
    if (!trimmed) {
      toast.error('El nombre del dispositivo no puede estar vacío');
      return;
    }

    setIsSavingSessionName(true);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ device_name: trimmed }),
      });

      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) throw new Error('No se pudo actualizar el nombre del dispositivo');

      toast.success(t('toasts.deviceRenamed'));
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, device_name: trimmed } : s))
      );
      setEditingSessionId(null);

      const targetSession = sessions.find((s) => s.id === sessionId);
      if (targetSession?.is_current && userConfig) {
        const updatedConfig: LocalUserConfig = { ...userConfig, device_name: trimmed };
        await saveUserConfig(updatedConfig);
        onConfigUpdated(updatedConfig);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al renombrar dispositivo';
      toast.error(msg);
    } finally {
      setIsSavingSessionName(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers,
      });

      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) throw new Error('No se pudo revocar la sesión remota');

      toast.success('Sesión revocada exitosamente');
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al revocar sesión';
      toast.error(msg);
    }
  };

  const handleRevokeOtherSessions = async () => {
    const activeToken = await getActiveToken();
    if (!activeToken) {
      toast.error('Token de sesión no disponible en este cliente');
      return;
    }

    setIsRevokingOthers(true);
    try {
      const res = await fetch('/api/sessions/revoke-others', {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': activeToken,
        },
      });

      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) throw new Error('No se pudieron revocar las otras sesiones');

      toast.success(t('toasts.allOtherSessionsRevoked') || 'Todas las demás sesiones fueron revocadas.');
      await fetchSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al revocar otras sesiones';
      toast.error(msg);
    } finally {
      setIsRevokingOthers(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Passkeys
  // ---------------------------------------------------------------------------
  const handleStartEditPasskey = (pk: PasskeyInfo) => {
    setEditingPasskeyId(pk.id);
    setEditingPasskeyName(pk.name || '');
  };

  const handleCancelEditPasskey = () => {
    setEditingPasskeyId(null);
    setEditingPasskeyName('');
  };

  const handleSaveEditPasskey = async (passkeyId: string) => {
    const trimmed = editingPasskeyName.trim();
    if (!trimmed) {
      toast.error('El nombre de la passkey no puede estar vacío');
      return;
    }

    setIsSavingPasskeyName(true);
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch(`/api/passkeys/${encodeURIComponent(passkeyId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: trimmed }),
      });

      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) throw new Error('No se pudo actualizar el nombre de la passkey');

      toast.success(t('toasts.passkeyRenamed'));
      setPasskeys((prev) =>
        prev.map((p) => (p.id === passkeyId ? { ...p, name: trimmed } : p))
      );
      setEditingPasskeyId(null);

      if (userConfig && userConfig.webauthn_credential_id === passkeyId) {
        const updatedConfig: LocalUserConfig = { ...userConfig, passkey_name: trimmed };
        await saveUserConfig(updatedConfig);
        onConfigUpdated(updatedConfig);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al renombrar passkey';
      toast.error(msg);
    } finally {
      setIsSavingPasskeyName(false);
    }
  };

  const handleRevokePasskey = async (passkeyId: string) => {
    try {
      const activeToken = await getActiveToken();
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch(`/api/passkeys/${encodeURIComponent(passkeyId)}`, {
        method: 'DELETE',
        headers,
      });

      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) throw new Error('No se pudo revocar la passkey');

      toast.success('Passkey eliminada y desvinculada del servidor');
      setPasskeys((prev) => prev.filter((p) => p.id !== passkeyId));

      // If revoking the local device passkey, also clean up local config
      if (userConfig?.webauthn_credential_id === passkeyId) {
        const updatedConfig: LocalUserConfig = {
          ...userConfig,
          webauthn_credential_id: undefined,
          wrapped_master_key: undefined,
        };
        await saveUserConfig(updatedConfig);
        onConfigUpdated(updatedConfig);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al revocar passkey';
      toast.error(msg);
    }
  };

  const handleEnrollPasskey = async (
    customName?: string,
    attachment: 'platform' | 'cross-platform' = enrollAttachment
  ) => {
    if (!masterKey || !userConfig) {
      toast.error('La bóveda debe estar desbloqueada para registrar una nueva passkey');
      return;
    }

    const defaultName =
      attachment === 'cross-platform'
        ? 'Llave Física YubiKey / FIDO2'
        : 'Windows Hello / Este dispositivo';
    const assignedName = (customName || '').trim() || defaultName;

    setIsEnrollingPasskey(true);
    try {
      const support = await checkWebAuthnSupport();
      if (!support.isSupported) {
        throw new Error('Tu navegador o dispositivo no soporta WebAuthn.');
      }
      if (attachment === 'platform' && !support.hasPlatformAuthenticator) {
        throw new Error('Autenticador de plataforma (Windows Hello / Biometría) no disponible.');
      }

      toast.info(
        attachment === 'cross-platform'
          ? 'Inserta tu llave de seguridad USB/NFC y tócala...'
          : 'Interactúa con la ventana del sistema operativo...'
      );
      const reg = await registerPasskey(userConfig.user_id, userConfig.username, attachment);
      const wrappedPkg = await wrapMasterKey(masterKey, reg.credentialId);

      const activeToken = await getActiveToken();
      // Register passkey in remote database
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      };
      if (activeToken) {
        headers['X-Session-Token'] = activeToken;
      }

      const res = await fetch('/api/passkeys', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          credential_id: reg.credentialId,
          name: assignedName,
        }),
      });

      const newTok = res.headers.get('X-New-Session-Token');
      if (newTok) await updateSessionToken(newTok);

      if (!res.ok) {
        console.warn('Could not register passkey on server; saving locally.');
      }

      const updatedConfig: LocalUserConfig = {
        ...userConfig,
        webauthn_credential_id: reg.credentialId,
        wrapped_master_key: JSON.stringify(wrappedPkg),
        passkey_name: assignedName,
      };

      await saveUserConfig(updatedConfig);
      onConfigUpdated(updatedConfig);

      toast.success(
        attachment === 'cross-platform'
          ? 'Llave física de seguridad (YubiKey) vinculada exitosamente'
          : 'Passkey / Windows Hello vinculada correctamente'
      );
      setShowEnrollForm(false);
      setNewPasskeyName('');
      await fetchPasskeys();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar passkey';
      toast.error(msg);
    } finally {
      setIsEnrollingPasskey(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Export Handlers: Audit Logs
  // ---------------------------------------------------------------------------
  const handleExportAuditCsv = () => {
    if (auditLogs.length === 0) return;
    const escapeCsv = (val: string | number | undefined) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = ['id', 'user_id', 'event_type', 'device_name', 'ip_country', 'metadata', 'timestamp'];
    const rows = [headers.join(',')];

    for (const log of auditLogs) {
      rows.push(
        [
          escapeCsv(log.id),
          escapeCsv(log.user_id),
          escapeCsv(log.event_type),
          escapeCsv(log.device_name || ''),
          escapeCsv(log.ip_country || ''),
          escapeCsv(log.metadata || ''),
          escapeCsv(new Date(log.created_at * 1000).toISOString()),
        ].join(',')
      );
    }

    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revolt-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Historial de seguridad exportado en CSV');
  };

  const handleExportAuditJson = () => {
    if (auditLogs.length === 0) return;
    const blob = new Blob([JSON.stringify(auditLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revolt-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Historial de seguridad exportado en JSON');
  };

  // ---------------------------------------------------------------------------
  // Helper Formatters
  // ---------------------------------------------------------------------------
  const formatAuditMetadata = (log: AuditLogItem): string => {
    if (!log.metadata) return '';
    try {
      const parsed = JSON.parse(log.metadata);
      if (log.event_type === 'LOGIN') {
        const device = parsed.device_name || log.device_name || t('audit.unknownDevice');
        return t('audit.loginSuccess', { device });
      }
      if (log.event_type === 'REGISTER') {
        return t('audit.registerSuccess');
      }
      if (log.event_type === 'PASSKEY_ADDED') {
        const name = parsed.passkey_name || 'Passkey';
        return t('audit.passkeyAdded', { name });
      }
      if (log.event_type === 'PASSKEY_RENAMED') {
        const newName = parsed.new_name || parsed.name || 'Passkey';
        return t('audit.passkeyRenamed', { name: newName });
      }
      if (log.event_type === 'DEVICE_RENAMED') {
        const newName = parsed.new_name || parsed.device_name || t('audit.unknownDevice');
        return t('audit.deviceRenamed', { name: newName });
      }
      if (log.event_type === 'SESSION_REVOKED') {
        const target = parsed.target_device || parsed.device_name || t('audit.unknownDevice');
        return t('audit.sessionRevoked', { device: target });
      }
      if (log.event_type === 'PASSKEY_REVOKED') {
        const target = parsed.target_name || parsed.name || 'Passkey';
        return t('audit.passkeyRevoked', { name: target });
      }
      if (log.event_type === 'ALL_SESSIONS_REVOKED') {
        return t('audit.allSessionsRevoked');
      }
      return Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(' · ');
    } catch {
      return log.metadata;
    }
  };
  const formatTimestamp = (tsSeconds: number) => {
    if (!tsSeconds) return '---';
    const date = new Date(tsSeconds * 1000);
    return date.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDeviceIcon = (deviceName?: string) => {
    const lower = (deviceName || '').toLowerCase();
    if (lower.includes('iphone') || lower.includes('android') || lower.includes('ipad')) {
      return <Smartphone className="w-4 h-4 text-sky-400" />;
    }
    return <Laptop className="w-4 h-4 text-emerald-400" />;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 animate-in fade-in-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-full max-w-2xl bg-[#0f1013] border border-white/[0.08] hairline-top shadow-[0_24px_68px_rgba(0,0,0,0.8)] rounded-xl p-4 sm:p-6 text-zinc-100 z-50 animate-in fade-in-0 zoom-in-95 duration-200 focus:outline-none max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top text-white">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-white tracking-tight">
                  {t('security.title')}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400">
                  {t('security.subtitle')}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-[#08090a] border border-white/[0.06] p-1 rounded-lg my-4 text-xs shrink-0 overflow-x-auto no-scrollbar gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('health')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'health'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('security.tabHealth')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'sessions'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>{t('security.tabSessions')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('passkeys')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'passkeys'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>{t('security.tabPasskeys')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'notifications'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('security.tabNotifications')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'audit'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{t('security.tabAudit')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('snapshots')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'snapshots'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <History className="w-3.5 h-3.5 text-blue-400" />
              <span>{t('security.tabSnapshots')}</span>
            </button>

          </div>

          {/* Tab Content Container */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs custom-scrollbar">
            {/* TAB 0: HEALTH & HYGIENE */}
            {activeTab === 'health' && (
              <div className="space-y-4">
                {/* Scorecard Hero Banner */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#12141a] to-[#181a22] border border-white/[0.08] hairline-top flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {/* Radial Score Gauge Badge */}
                    <div
                      className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center border font-bold shrink-0 ${
                        healthScore.grade === 'excellent'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : healthScore.grade === 'good'
                          ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                          : healthScore.grade === 'warning'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      <span className="text-lg leading-none">{healthScore.score}%</span>
                      <span className="text-[9px] uppercase tracking-wider font-medium opacity-80 mt-0.5">
                        {healthScore.grade === 'excellent'
                          ? t('hygiene.scoreGradeExcellent')
                          : healthScore.grade === 'good'
                          ? t('hygiene.scoreGradeGood')
                          : healthScore.grade === 'warning'
                          ? t('hygiene.scoreGradeWarning')
                          : t('hygiene.scoreGradeCritical')}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                        {t('hygiene.scoreTitle')}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            healthScore.grade === 'excellent'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : healthScore.grade === 'good'
                              ? 'bg-sky-500/20 text-sky-300'
                              : healthScore.grade === 'warning'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {healthScore.score >= 80 ? 'Segura' : 'Atención requerida'}
                        </span>
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {t('hygiene.scoreSubtitle')}
                      </p>
                    </div>
                  </div>

                  {/* Backup and Emergency Kit Quick Actions */}
                  <div className="flex items-center gap-2">
                    {onOpenEmergencyKit && (
                      <button
                        type="button"
                        onClick={onOpenEmergencyKit}
                        className="py-1.5 px-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-xs font-medium transition-all shrink-0 flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{t('emergencyKit.generate')}</span>
                      </button>
                    )}
                    {onOpenBackup && (
                      <button
                        type="button"
                        onClick={onOpenBackup}
                        className="py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] text-xs font-medium transition-all shrink-0 flex items-center gap-1.5"
                      >
                        <Database className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{t('hygiene.actionBackup')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Metric Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#16181d]/50 border border-white/[0.06]">
                    <div className="text-[10px] text-zinc-400">{t('hygiene.statAccounts')}</div>
                    <div className="text-base font-semibold text-zinc-100 mt-0.5">
                      {healthScore.totalAccounts}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#16181d]/50 border border-white/[0.06]">
                    <div className="text-[10px] text-zinc-400">{t('hygiene.statDuplicates')}</div>
                    <div className={`text-base font-semibold mt-0.5 ${healthScore.stats.duplicateSecretsCount > 0 ? 'text-amber-400' : 'text-zinc-100'}`}>
                      {healthScore.stats.duplicateSecretsCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#16181d]/50 border border-white/[0.06]">
                    <div className="text-[10px] text-zinc-400">{t('hygiene.statWeak')}</div>
                    <div className={`text-base font-semibold mt-0.5 ${healthScore.stats.weakSecretsCount > 0 ? 'text-rose-400' : 'text-zinc-100'}`}>
                      {healthScore.stats.weakSecretsCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#16181d]/50 border border-white/[0.06]">
                    <div className="text-[10px] text-zinc-400">{t('hygiene.statLastBackup')}</div>
                    <div className="text-xs font-semibold text-zinc-200 mt-1 truncate">
                      {lastBackupAt
                        ? Math.floor((Date.now() - lastBackupAt) / (1000 * 60 * 60 * 24)) === 0
                          ? t('hygiene.backupToday')
                          : t('hygiene.backupDaysAgo', { days: Math.floor((Date.now() - lastBackupAt) / (1000 * 60 * 60 * 24)) })
                        : t('hygiene.backupNever')}
                    </div>
                  </div>
                </div>

                {/* Findings & Recommendations Section */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('hygiene.issuesTitle')}</span>
                    <span className="text-[10px] text-zinc-500 font-normal">
                      ({healthScore.issues.length})
                    </span>
                  </h4>

                  {healthScore.issues.length === 0 ? (
                    <div className="p-4 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-emerald-300">
                          {t('hygiene.allGoodTitle')}
                        </div>
                        <div className="text-[11px] text-emerald-400/80">
                          {t('hygiene.allGoodDesc')}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {healthScore.issues.map((issue) => {
                        const title = t(issue.titleKey, issue.descParams);
                        const desc = t(issue.descKey, issue.descParams);

                        return (
                          <div
                            key={issue.id}
                            className="p-3 rounded-lg bg-[#16181d]/60 border border-white/[0.06] flex items-start justify-between gap-3 text-[11px]"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${
                                    issue.severity === 'critical'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                      : issue.severity === 'warning'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  }`}
                                >
                                  {issue.severity === 'critical'
                                    ? t('hygiene.severityCritical')
                                    : issue.severity === 'warning'
                                    ? t('hygiene.severityWarning')
                                    : t('hygiene.severitySuggestion')}
                                </span>
                                <span className="font-semibold text-zinc-200 truncate">{title}</span>
                              </div>
                              <p className="text-zinc-400 text-[11px] leading-relaxed">{desc}</p>
                            </div>

                            {issue.actionType === 'open_backup' && onOpenBackup && (
                              <button
                                type="button"
                                onClick={onOpenBackup}
                                className="py-1 px-2.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1] text-[11px] font-medium transition-all shrink-0 self-center"
                              >
                                {t('hygiene.actionBackup')}
                              </button>
                            )}

                            {issue.actionType === 'open_item' && issue.itemId && onSelectAccount && (
                              <button
                                type="button"
                                onClick={() => {
                                  const it = items.find((i) => i.id === issue.itemId);
                                  if (it) {
                                    onClose();
                                    onSelectAccount(it);
                                  }
                                }}
                                className="py-1 px-2.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1] text-[11px] font-medium transition-all shrink-0 self-center"
                              >
                                {t('hygiene.actionViewAccount')}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* k-Anonymity Leak Checker (HaveIBeenPwned) */}
                <div className="p-3.5 rounded-xl bg-[#08090a] border border-white/[0.08] space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-sky-400" />
                      <span>{t('hygiene.leakCheckerTitle')}</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {t('hygiene.leakCheckerSubtitle')}
                    </p>
                  </div>

                  <form onSubmit={handleCheckLeak} className="flex gap-2">
                    <input
                      type="password"
                      value={leakInput}
                      onChange={(e) => {
                        setLeakInput(e.target.value);
                        if (leakResult) setLeakResult(null);
                      }}
                      placeholder={t('hygiene.leakInputPlaceholder')}
                      className="flex-1 bg-[#16181d] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500/50"
                    />
                    <button
                      type="submit"
                      disabled={isCheckingLeak || !leakInput.trim()}
                      className="py-1.5 px-3.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium text-xs hover:bg-sky-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isCheckingLeak ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>{t('hygiene.leakChecking')}</span>
                        </>
                      ) : (
                        <span>{t('hygiene.leakButtonCheck')}</span>
                      )}
                    </button>
                  </form>

                  {/* Leak Result Feedback */}
                  {leakResult && (
                    <div
                      className={`p-2.5 rounded-lg border text-xs flex items-center gap-2.5 ${
                        leakResult.compromised
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      {leakResult.compromised ? (
                        <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      )}
                      <div className="flex-1 text-[11px]">
                        {leakResult.compromised
                          ? t('hygiene.leakResultCompromised', { count: leakResult.count.toLocaleString() })
                          : t('hygiene.leakResultSafe')}
                      </div>
                    </div>
                  )}

                  {/* Zero-Knowledge guarantee disclaimer */}
                  <div className="text-[10px] text-zinc-500 leading-relaxed bg-[#16181d]/30 p-2 rounded border border-white/[0.04]">
                    {t('hygiene.leakNotice')}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 1: SESSIONS */}
            {activeTab === 'sessions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">{t('security.sessionsTitle')}</h4>
                    <p className="text-[11px] text-zinc-400">
                      {t('security.sessionsSubtitle')}
                    </p>
                  </div>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={handleRevokeOtherSessions}
                      disabled={isRevokingOthers}
                      className="py-1.5 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium text-[11px] hover:bg-rose-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>{isRevokingOthers ? t('security.revokingSessions') : t('security.revokeOtherSessions')}</span>
                    </button>
                  )}
                </div>

                {isLoadingSessions ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-zinc-300" />
                    <span>{t('security.loadingSessions')}</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-8 text-center bg-[#08090a] rounded-lg border border-white/[0.04] text-zinc-400">
                    {t('security.noSessions')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className="p-3 rounded-lg bg-[#16181d]/50 border border-white/[0.06] flex items-center justify-between gap-4 hover:border-white/[0.12] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-2 rounded-md bg-[#08090a] border border-white/[0.06] shrink-0">
                            {getDeviceIcon(session.device_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            {editingSessionId === session.id ? (
                              <div className="flex items-center gap-1.5 py-0.5">
                                <input
                                  type="text"
                                  value={editingSessionName}
                                  onChange={(e) => setEditingSessionName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEditSession(session.id);
                                    if (e.key === 'Escape') handleCancelEditSession();
                                  }}
                                  disabled={isSavingSessionName}
                                  className="bg-[#08090a] border border-white/20 text-white text-xs px-2 py-1 rounded focus:outline-none focus:border-white/50 w-48"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditSession(session.id)}
                                  disabled={isSavingSessionName}
                                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-emerald-400 transition-colors"
                                  title={t('security.saveDeviceName')}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditSession}
                                  disabled={isSavingSessionName}
                                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                  title={t('common.cancel')}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span className="font-medium text-white truncate">
                                  {session.device_name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditSession(session)}
                                  className="opacity-40 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-zinc-200 transition-opacity"
                                  title={t('security.renameDeviceTooltip')}
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                                {session.is_current && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                    {t('common.thisDevice')}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 font-mono">
                              {session.ip_country && (
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3 text-zinc-500" />
                                  <span>{session.ip_country}</span>
                                  <span>·</span>
                                </span>
                              )}
                              <span>{t('security.activeLabel')}: {formatTimestamp(session.last_active_at)}</span>
                            </div>
                          </div>
                        </div>

                        {!session.is_current && (
                          <button
                            type="button"
                            onClick={() => handleRevokeSession(session.id)}
                            className="py-1 px-2.5 rounded-md text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-[11px] transition-all flex items-center gap-1.5 shrink-0"
                            title={t('security.revokeSessionButton')}
                          >
                            <LogOut className="w-3 h-3" />
                            <span>{t('security.revokeSessionButton')}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PASSKEYS */}
            {activeTab === 'passkeys' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">{t('security.passkeysTitle')}</h4>
                    <p className="text-[11px] text-zinc-400">
                      {t('security.passkeysSubtitle')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEnrollForm(!showEnrollForm);
                      if (!showEnrollForm) setNewPasskeyName('');
                    }}
                    disabled={isEnrollingPasskey}
                    className="py-1.5 px-3 rounded-lg bg-white hover:bg-zinc-200 text-black font-medium text-xs shadow-sm flex items-center gap-1.5 transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5 text-black" />
                    <span>{showEnrollForm ? t('security.cancelEnroll') : t('security.enrollPasskeyButton')}</span>
                  </button>
                </div>

                {/* Inline Enrollment Card */}
                {showEnrollForm && (
                  <div className="p-3 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs text-white">
                        {enrollAttachment === 'cross-platform' ? 'Vincular Llave Física de Seguridad' : t('security.newPasskeyNameLabel')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowEnrollForm(false)}
                        className="text-zinc-400 hover:text-white p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Selector: Platform (Windows Hello) vs Cross-Platform (YubiKey) */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#08090a] border border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => {
                          setEnrollAttachment('platform');
                          setNewPasskeyName('Windows Hello / Este dispositivo');
                        }}
                        className={`py-1 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all ${
                          enrollAttachment === 'platform'
                            ? 'bg-white/[0.1] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Windows Hello / Biometría</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEnrollAttachment('cross-platform');
                          setNewPasskeyName('YubiKey / Llave Física');
                        }}
                        className={`py-1 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all ${
                          enrollAttachment === 'cross-platform'
                            ? 'bg-white/[0.1] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Usb className="w-3.5 h-3.5 text-sky-400" />
                        <span>YubiKey / FIDO2 Roaming</span>
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={
                          enrollAttachment === 'cross-platform'
                            ? 'Nombre de la llave (ej. YubiKey 5C NFC)'
                            : t('security.newPasskeyPlaceholder')
                        }
                        value={newPasskeyName}
                        onChange={(e) => setNewPasskeyName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEnrollPasskey(newPasskeyName, enrollAttachment);
                        }}
                        className="flex-1 bg-[#08090a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleEnrollPasskey(newPasskeyName, enrollAttachment)}
                        disabled={isEnrollingPasskey}
                        className="px-3 py-1.5 bg-white text-black font-medium text-xs rounded-lg hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                      >
                        {isEnrollingPasskey ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>{t('security.enrollingPasskey')}</span>
                          </>
                        ) : (
                          <span>{t('security.enrollNowButton')}</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {isLoadingPasskeys ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-zinc-300" />
                    <span>{t('security.loadingPasskeys')}</span>
                  </div>
                ) : passkeys.length === 0 ? (
                  <div className="py-8 text-center bg-[#08090a] rounded-lg border border-white/[0.04] text-zinc-400 space-y-2">
                    <p>{t('security.noPasskeys')}</p>
                    <p className="text-[11px] text-zinc-500">
                      {t('security.noPasskeysHelp')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {passkeys.map((pk) => {
                      const isLocalCredential = userConfig?.webauthn_credential_id === pk.id;
                      return (
                        <div
                          key={pk.id}
                          className="p-3 rounded-lg bg-[#16181d]/50 border border-white/[0.06] flex items-center justify-between gap-4 hover:border-white/[0.12] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="p-2 rounded-md bg-[#08090a] border border-white/[0.06] text-white shrink-0">
                              <Key className="w-3.5 h-3.5 text-zinc-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                              {editingPasskeyId === pk.id ? (
                                <div className="flex items-center gap-1.5 py-0.5">
                                  <input
                                    type="text"
                                    value={editingPasskeyName}
                                    onChange={(e) => setEditingPasskeyName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEditPasskey(pk.id);
                                      if (e.key === 'Escape') handleCancelEditPasskey();
                                    }}
                                    disabled={isSavingPasskeyName}
                                    className="bg-[#08090a] border border-white/20 text-white text-xs px-2 py-1 rounded focus:outline-none focus:border-white/50 w-48"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEditPasskey(pk.id)}
                                    disabled={isSavingPasskeyName}
                                    className="p-1 rounded bg-white/10 hover:bg-white/20 text-emerald-400 transition-colors"
                                    title={t('security.saveDeviceName')}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditPasskey}
                                    disabled={isSavingPasskeyName}
                                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                    title={t('common.cancel')}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group">
                                  <span className="font-medium text-white truncate">{pk.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditPasskey(pk)}
                                    className="opacity-40 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-zinc-200 transition-opacity"
                                    title={t('security.renamePasskeyTooltip')}
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                  </button>
                                  {isLocalCredential && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-zinc-300 border border-white/[0.1] shrink-0">
                                      {t('common.thisComputer')}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                                {pk.device_name && <span>{pk.device_name} · </span>}
                                <span>{t('security.linkedOn')}: {formatTimestamp(pk.created_at)}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRevokePasskey(pk.id)}
                            className="py-1 px-2.5 rounded-md text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-[11px] transition-all flex items-center gap-1 shrink-0"
                            title={t('security.deletePasskeyButton')}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t('security.deletePasskeyButton')}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: PROACTIVE ALERTS & BYOK & KDF */}
            {activeTab === 'notifications' && (
              <div className="space-y-5">
                {/* 1. Header description */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-amber-400" />
                      <span>{t('security.notificationsTitle')}</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      {t('security.notificationsSubtitle')}
                    </p>
                  </div>
                </div>

                {/* 2. Web Push Section */}
                <div className="p-4 rounded-xl bg-[#12141a] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{t('security.pushSectionTitle')}</span>
                      </h5>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {t('security.pushSectionSubtitle')}
                      </p>
                    </div>
                  </div>

                  {pushPermission === 'unsupported' ? (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-2 text-[11px]">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{t('security.pushStatusUnsupported')}</span>
                    </div>
                  ) : pushPermission === 'denied' ? (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-2 text-[11px]">
                      <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">{t('security.pushStatusDenied')}</div>
                        <div className="text-[10px] text-rose-200/80 mt-0.5">{t('security.pushStatusDeniedHelp')}</div>
                      </div>
                    </div>
                  ) : isPushSubscribed ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <div className="flex items-center gap-2 text-[11px] font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{t('security.pushStatusActive')}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300">
                          RFC 8292
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTestPush}
                          disabled={isTestingPush}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] font-medium transition-all flex items-center justify-center gap-1.5"
                        >
                          {isTestingPush ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-amber-400" />}
                          <span>{t('security.testPush')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleUnsubscribePush}
                          disabled={isLoadingPush}
                          className="py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 font-medium transition-all flex items-center gap-1.5"
                        >
                          {isLoadingPush ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                          <span>{t('security.disablePush')}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#16181d] border border-white/[0.06] text-zinc-400">
                        <span className="text-[11px]">{t('security.pushStatusInactive')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSubscribePush}
                        disabled={isLoadingPush}
                        className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-all flex items-center justify-center gap-1.5"
                      >
                        {isLoadingPush ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                        <span>{t('security.enablePush')}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. BYOK Email Section */}
                <div className="p-4 rounded-xl bg-[#12141a] border border-white/[0.08] space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-sky-400" />
                        <span>{t('security.emailSectionTitle')}</span>
                      </h5>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {t('security.emailSectionSubtitle')}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emailEnabled}
                        onChange={(e) => setEmailEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {emailEnabled && (
                    <div className="space-y-3.5 pt-2 border-t border-white/[0.06]">
                      {/* Provider Toggle */}
                      <div>
                        <label className="text-[11px] font-medium text-zinc-300 block mb-1.5">
                          {t('security.emailProviderLabel')}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEmailProvider('resend')}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              emailProvider === 'resend'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-[#16181d] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <div className="font-semibold text-xs text-white flex items-center gap-1.5">
                              <span>Resend</span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono">FREE</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-1">3.000 emails/mes gratis</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEmailProvider('cloudflare')}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              emailProvider === 'cloudflare'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : 'bg-[#16181d] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <div className="font-semibold text-xs text-white flex items-center gap-1.5">
                              <span>Cloudflare</span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-mono">PAID $5</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-1">Workers Paid requerido</div>
                          </button>
                        </div>
                      </div>

                      {/* Notice Callout */}
                      {emailProvider === 'resend' ? (
                        <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-zinc-300 flex items-start gap-2">
                          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{t('security.resendNotice')}</span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span>{t('security.cfNotice')}</span>
                        </div>
                      )}

                      {/* Destination Email */}
                      <div>
                        <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                          {t('security.emailDestinationLabel')}
                        </label>
                        <input
                          type="email"
                          value={destinationEmail}
                          onChange={(e) => setDestinationEmail(e.target.value)}
                          placeholder={t('security.emailDestinationPlaceholder')}
                          className="w-full bg-[#16181d] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {/* Resend Fields */}
                      {emailProvider === 'resend' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                              {t('security.resendKeyLabel')}
                            </label>
                            <div className="relative">
                              <input
                                type={showResendKey ? 'text' : 'password'}
                                value={resendApiKey}
                                onChange={(e) => setResendApiKey(e.target.value)}
                                placeholder={hasStoredResendKey ? '•••••••••••••••• (API Key guardada)' : t('security.resendKeyPlaceholder')}
                                className="w-full bg-[#16181d] border border-white/[0.08] rounded-lg pl-3 pr-9 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowResendKey(!showResendKey)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                              >
                                {showResendKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                              {t('security.resendFromLabel')}
                            </label>
                            <input
                              type="text"
                              value={resendFromEmail}
                              onChange={(e) => setResendFromEmail(e.target.value)}
                              placeholder={t('security.resendFromPlaceholder')}
                              className="w-full bg-[#16181d] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* Triggers selection */}
                      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                        <label className="text-[11px] font-semibold text-zinc-300 block">
                          {t('security.eventsSectionTitle')}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notifyNewCountry}
                              onChange={(e) => setNotifyNewCountry(e.target.checked)}
                              className="rounded border-white/[0.1] bg-[#16181d] text-emerald-500 focus:ring-0"
                            />
                            <span>{t('security.eventNewCountry')}</span>
                          </label>
                          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notifyNewSession}
                              onChange={(e) => setNotifyNewSession(e.target.checked)}
                              className="rounded border-white/[0.1] bg-[#16181d] text-emerald-500 focus:ring-0"
                            />
                            <span>{t('security.eventNewSession')}</span>
                          </label>
                          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notifyPasskeyAdded}
                              onChange={(e) => setNotifyPasskeyAdded(e.target.checked)}
                              className="rounded border-white/[0.1] bg-[#16181d] text-emerald-500 focus:ring-0"
                            />
                            <span>{t('security.eventPasskeyAdded')}</span>
                          </label>
                          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={notifySessionRevoked}
                              onChange={(e) => setNotifySessionRevoked(e.target.checked)}
                              className="rounded border-white/[0.1] bg-[#16181d] text-emerald-500 focus:ring-0"
                            />
                            <span>{t('security.eventSessionRevoked')}</span>
                          </label>
                        </div>
                      </div>

                      {/* Email Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleSaveNotificationSettings}
                          disabled={isSavingSettings || isLoadingSettings}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isSavingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>{t('security.saveNotificationSettings')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleTestEmail}
                          disabled={isTestingEmail || !destinationEmail}
                          className="py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isTestingEmail ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-sky-400" />}
                          <span>{t('security.testEmail')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. KDF Cryptographic Engine Card */}
                <div className="p-4 rounded-xl bg-[#12141a] border border-white/[0.08] space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-violet-400" />
                        <span>{t('security.kdfSectionTitle')}</span>
                      </h5>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {t('security.kdfSectionSubtitle')}
                      </p>
                    </div>
                  </div>

                  {userConfig?.kdf_algorithm === 'argon2id' ? (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-xs">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>{t('security.kdfArgon2idActive')}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300">
                          64 MB · 3 Rondas
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                        {t('security.kdfArgon2idDesc')}
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>{t('security.kdfPbkdf2Active')}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300">
                          Legado
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        {t('security.kdfPbkdf2Desc')}
                      </p>

                      <form onSubmit={handleUpgradeKdfManual} className="space-y-2 pt-2 border-t border-amber-500/20">
                        <div className="relative">
                          <input
                            type={showUpgradePassword ? 'text' : 'password'}
                            value={kdfUpgradePassword}
                            onChange={(e) => setKdfUpgradePassword(e.target.value)}
                            placeholder="Contraseña maestra actual"
                            className="w-full bg-[#16181d] border border-amber-500/30 rounded-lg pl-3 pr-9 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowUpgradePassword(!showUpgradePassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                          >
                            {showUpgradePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <button
                          type="submit"
                          disabled={isUpgradingKdf || !kdfUpgradePassword}
                          className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isUpgradingKdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          <span>{isUpgradingKdf ? t('security.upgradingKdf') : t('security.upgradeKdfBtn')}</span>
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: AUDIT LOGS */}
            {activeTab === 'audit' && (

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">{t('security.auditTitle')}</h4>
                    <p className="text-[11px] text-zinc-400">
                      {t('security.auditSubtitle')}
                    </p>
                  </div>
                  {auditLogs.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleExportAuditCsv}
                        className="py-1 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08] text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                        title="Exportar como hoja de cálculo CSV"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                        <span>CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportAuditJson}
                        className="py-1 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08] text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                        title="Exportar como JSON estructurado"
                      >
                        <FileJson className="w-3.5 h-3.5 text-sky-400" />
                        <span>JSON</span>
                      </button>
                    </div>
                  )}
                </div>

                {isLoadingAudit ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-zinc-300" />
                    <span>{t('security.loadingAudit')}</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="py-8 text-center bg-[#08090a] rounded-lg border border-white/[0.04] text-zinc-400">
                    {t('security.noAudit')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => {
                      let badge = (
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06] font-mono text-[10px]">
                          {log.event_type}
                        </span>
                      );
                      if (log.event_type === 'LOGIN' || log.event_type === 'REGISTER') {
                        badge = (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px]">
                            {log.event_type}
                          </span>
                        );
                      } else if (
                        log.event_type === 'SESSION_REVOKED' ||
                        log.event_type === 'PASSKEY_REVOKED' ||
                        log.event_type === 'ALL_SESSIONS_REVOKED'
                      ) {
                        badge = (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-[10px]">
                            {log.event_type}
                          </span>
                        );
                      } else if (log.event_type === 'PASSKEY_ADDED') {
                        badge = (
                          <span className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/20 text-white font-mono text-[10px]">
                            {log.event_type}
                          </span>
                        );
                      } else if (log.event_type === 'PASSKEY_RENAMED' || log.event_type === 'DEVICE_RENAMED') {
                        badge = (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono text-[10px]">
                            {log.event_type}
                          </span>
                        );
                      }

                      const displayedDevice =
                        log.device_name && log.device_name !== 'Desconocido'
                          ? log.device_name
                          : (() => {
                              try {
                                const parsed = log.metadata ? JSON.parse(log.metadata) : {};
                                return parsed.device_name || parsed.target_device || t('audit.unknownDevice');
                              } catch {
                                return t('audit.unknownDevice');
                              }
                            })();

                      return (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-lg bg-[#16181d]/50 border border-white/[0.06] flex items-center justify-between text-[11px]"
                        >
                          <div className="space-y-1 min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2">
                              {badge}
                              <span className="text-zinc-200 font-medium">{displayedDevice}</span>
                              {log.ip_country && (
                                <span className="text-zinc-500">({log.ip_country})</span>
                              )}
                            </div>
                            {log.metadata && (
                              <p className="text-zinc-400 text-[11px] truncate max-w-lg">
                                {formatAuditMetadata(log)}
                              </p>
                            )}
                          </div>
                          <div className="text-zinc-500 font-mono text-right shrink-0">
                            {formatTimestamp(log.created_at)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: VAULT HISTORY / SNAPSHOTS */}
            {activeTab === 'snapshots' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">{t('security.snapshotsTitle')}</h4>
                    <p className="text-[11px] text-zinc-400">
                      {t('security.snapshotsSubtitle')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchSnapshots}
                    disabled={isLoadingSnapshots}
                    className="p-1.5 rounded-lg bg-[#16181d] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 border border-white/[0.08] transition-colors"
                    title="Recargar snapshots"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSnapshots ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {isLoadingSnapshots ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-zinc-300" />
                    <span>Cargando snapshots de la bóveda...</span>
                  </div>
                ) : snapshots.length === 0 ? (
                  <div className="py-8 text-center bg-[#08090a] rounded-xl border border-white/[0.04] text-zinc-400 space-y-1.5">
                    <History className="w-6 h-6 mx-auto text-zinc-600 mb-2" />
                    <p className="text-xs text-zinc-300 font-medium">{t('security.noSnapshots')}</p>
                    <p className="text-[11px] text-zinc-500">Cada vez que guardas o modificas un elemento, se archiva automáticamente un snapshot previo en Cloudflare D1.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.vault_version}
                        className="p-3 rounded-xl bg-[#08090a] border border-white/[0.06] hover:border-white/[0.12] flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 font-mono text-xs font-bold">
                            v{snap.vault_version}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-zinc-200">
                                {t('security.snapshotVersion', { version: snap.vault_version })}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                                D1 Snapshot
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                              {new Date(snap.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={restoringVersion !== null}
                          onClick={() => handleRestoreSnapshot(snap.vault_version)}
                          className="px-3 py-1.5 rounded-lg bg-[#16181d] hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-white/[0.08] hover:border-blue-500/30 text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${restoringVersion === snap.vault_version ? 'animate-spin' : ''}`} />
                          <span>
                            {restoringVersion === snap.vault_version
                              ? t('security.restoringSnapshot')
                              : t('security.restoreSnapshot')}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-3 mt-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-zinc-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('common.zeroKnowledgeBadge')}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="py-1.5 px-3.5 rounded-lg bg-[#16181d] text-zinc-200 border border-white/[0.08] font-medium hover:bg-[#1c1f24] hover:text-white transition-all text-xs"
            >
              {t('common.close')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
