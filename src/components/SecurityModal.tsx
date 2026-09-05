import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../i18n/index.ts';

import type { LocalUserConfig, SessionInfo, PasskeyInfo, AuditLogItem } from '../types/vault';
import type { ApiResponse } from '../worker/types';
import {
  registerPlatformPasskey,
  wrapMasterKey,
  checkWebAuthnSupport,
} from '../lib/crypto/webauthn';
import { saveUserConfig } from '../lib/storage/idb';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  sessionToken?: string;
  userConfig: LocalUserConfig | null;
  masterKey: CryptoKey | null;
  onConfigUpdated: (config: LocalUserConfig) => void;
}

export function SecurityModal({
  isOpen,
  onClose,
  userId,
  sessionToken,
  userConfig,
  masterKey,
  onConfigUpdated,
}: SecurityModalProps) {
  const { t, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState<'sessions' | 'passkeys' | 'audit'>('sessions');

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
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState('');
  const [isSavingPasskeyName, setIsSavingPasskeyName] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching: Sessions
  // ---------------------------------------------------------------------------
  const fetchSessions = useCallback(async () => {
    if (!userId) return;
    setIsLoadingSessions(true);
    try {
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch('/api/sessions', { headers });
      if (!res.ok) throw new Error('Error al consultar sesiones activas');

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
  }, [userId, sessionToken]);

  // ---------------------------------------------------------------------------
  // Data Fetching: Passkeys
  // ---------------------------------------------------------------------------
  const fetchPasskeys = useCallback(async () => {
    if (!userId) return;
    setIsLoadingPasskeys(true);
    try {
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch('/api/passkeys', { headers });
      if (!res.ok) throw new Error('Error al consultar passkeys vinculadas');

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
                ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
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
  }, [userId, sessionToken, userConfig]);

  // ---------------------------------------------------------------------------
  // Data Fetching: Audit Logs
  // ---------------------------------------------------------------------------
  const fetchAuditLogs = useCallback(async () => {
    if (!userId) return;
    setIsLoadingAudit(true);
    try {
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch('/api/audit', { headers });
      if (!res.ok) throw new Error('Error al consultar historial de seguridad');

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
  }, [userId, sessionToken]);

  // Trigger loads on modal open or tab change
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'sessions') {
      fetchSessions();
    } else if (activeTab === 'passkeys') {
      fetchPasskeys();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [isOpen, activeTab, fetchSessions, fetchPasskeys, fetchAuditLogs]);

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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ device_name: trimmed }),
      });

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
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) throw new Error('No se pudo revocar la sesión remota');

      toast.success('Sesión revocada exitosamente');
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al revocar sesión';
      toast.error(msg);
    }
  };

  const handleRevokeOtherSessions = async () => {
    if (!sessionToken) {
      toast.error('Token de sesión no disponible en este cliente');
      return;
    }

    setIsRevokingOthers(true);
    try {
      const res = await fetch('/api/sessions/revoke-others', {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
          'X-Session-Token': sessionToken,
        },
      });

      if (!res.ok) throw new Error('No se pudieron revocar las otras sesiones');

      toast.success('Todas las demás sesiones fueron revocadas.');
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch(`/api/passkeys/${encodeURIComponent(passkeyId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: trimmed }),
      });

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
      const headers: Record<string, string> = {
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch(`/api/passkeys/${encodeURIComponent(passkeyId)}`, {
        method: 'DELETE',
        headers,
      });

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

  const handleEnrollPasskey = async (customName?: string) => {
    if (!masterKey || !userConfig) {
      toast.error('La bóveda debe estar desbloqueada para registrar una nueva passkey');
      return;
    }

    const assignedName = (customName || '').trim() || 'Windows Hello / Este dispositivo';

    setIsEnrollingPasskey(true);
    try {
      const support = await checkWebAuthnSupport();
      if (!support.isSupported || !support.hasPlatformAuthenticator) {
        throw new Error('Tu navegador o dispositivo no soporta autenticación biométrica/PIN de plataforma.');
      }

      toast.info('Interactúa con la ventana del sistema operativo...');
      const reg = await registerPlatformPasskey(userConfig.user_id, userConfig.username);
      const wrappedPkg = await wrapMasterKey(masterKey, reg.credentialId);

      // Register passkey in remote database
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      };
      if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const res = await fetch('/api/passkeys', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          credential_id: reg.credentialId,
          name: assignedName,
        }),
      });

      if (!res.ok) {
        console.warn('Could not register passkey on server; saving locally.');
      }

      const updatedConfig: LocalUserConfig = {
        ...userConfig,
        webauthn_credential_id: reg.credentialId,
        wrapped_master_key: JSON.stringify(wrappedPkg),
      };

      await saveUserConfig(updatedConfig);
      onConfigUpdated(updatedConfig);

      toast.success('Passkey / Windows Hello vinculada correctamente');
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
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[#0f1013] border border-white/[0.08] hairline-top shadow-[0_24px_68px_rgba(0,0,0,0.8)] rounded-xl p-6 text-zinc-100 z-50 animate-in fade-in-0 zoom-in-95 duration-200 focus:outline-none max-h-[90vh] flex flex-col">
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
          <div className="flex bg-[#08090a] border border-white/[0.06] p-1 rounded-lg my-4 text-xs shrink-0">
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
          </div>

          {/* Tab Content Container */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs custom-scrollbar">
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
                  <div className="p-3 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs text-white">{t('security.newPasskeyNameLabel')}</span>
                      <button
                        type="button"
                        onClick={() => setShowEnrollForm(false)}
                        className="text-zinc-400 hover:text-white p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={t('security.newPasskeyPlaceholder')}
                        value={newPasskeyName}
                        onChange={(e) => setNewPasskeyName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEnrollPasskey(newPasskeyName);
                        }}
                        className="flex-1 bg-[#08090a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleEnrollPasskey(newPasskeyName)}
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

            {/* TAB 3: AUDIT LOGS */}
            {activeTab === 'audit' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">{t('security.auditTitle')}</h4>
                  <p className="text-[11px] text-zinc-400">
                    {t('security.auditSubtitle')}
                  </p>
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
