import { useState, useEffect, useCallback, useTransition, useMemo, useRef } from 'react';
import {
  Shield,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
  Search,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  FolderArchive,
  Download,
  LogIn,
  UserPlus,
  ArrowLeft,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'motion/react';
import { Toaster, toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

import {
  getLocalVault,
  saveLocalVault,
  getUserConfig,
  saveUserConfig,
  updateSessionToken,
} from './lib/storage/idb.ts';
import { deriveMasterKey, generateSalt } from './lib/crypto/kdf.ts';
import { encryptVault, decryptVault } from './lib/crypto/vault.ts';
import {
  checkWebAuthnSupport,
  registerPlatformPasskey,
  verifyPlatformPasskey,
  wrapMasterKey,
  unwrapMasterKey,
  type WrappedKeyPackage,
} from './lib/crypto/webauthn.ts';
import { syncTimeWithServer } from './lib/sync/timeSync.ts';
import {
  pullRemoteVault,
  pushLocalVault,
  onSyncStateChange,
  initNetworkSyncListeners,
  deduplicateVaultItems,
} from './lib/sync/syncEngine.ts';
import { AutoLockManager } from './lib/security/autoLock.ts';

import { VaultList } from './components/VaultList.tsx';
import { QrModal } from './components/QrModal.tsx';
import { PasswordGeneratorModal } from './components/PasswordGeneratorModal.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { BackupModal } from './components/BackupModal.tsx';
import { EditAccountModal } from './components/EditAccountModal.tsx';
import { SecurityModal } from './components/SecurityModal.tsx';

import type { VaultItem, LocalUserConfig, SyncStatus } from './types/vault.ts';
import type { ApiResponse } from './worker/types.ts';
import { VERSION_NAME } from './constants/version.ts';
import { useTranslation, LanguageSwitcher } from './i18n/index.ts';

type AppScreen = 'loading' | 'register' | 'locked' | 'unlocked';
type AuthMode = 'login' | 'register';

const IS_PRIVATE_INSTANCE = import.meta.env.VITE_PRIVATE_INSTANCE === 'true';

export function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [userConfig, setUserConfig] = useState<LocalUserConfig | null>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [vaultVersion, setVaultVersion] = useState<number>(1);
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>('synced');
  const [isMasterAccessUnlocked, setIsMasterAccessUnlocked] = useState(false);

  // Modals
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);

  // Authentication Forms
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [hasPasskeySupport, setHasPasskeySupport] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Mutable reference to masterKey for network listeners without re-triggering init effects
  const masterKeyRef = useRef<CryptoKey | null>(null);
  masterKeyRef.current = masterKey;

  const [, startTransition] = useTransition();

  // Listen for remote session revocation
  useEffect(() => {
    const handleRevoked = () => {
      setMasterKey(null);
      setScreen('locked');
      setUserConfig((prev) => (prev ? { ...prev, session_token: undefined } : prev));
      updateSessionToken('').catch(() => {});
      toast.error(t('toasts.sessionRevokedTitle'), {
        description: t('toasts.sessionRevokedDesc'),
        duration: 8000,
      });
    };
    window.addEventListener('revolt:session-revoked', handleRevoked);
    return () => window.removeEventListener('revolt:session-revoked', handleRevoked);
  }, [t]);

  // Listen for session token rotation updates from sync engine
  useEffect(() => {
    const handleTokenUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ session_token: string }>;
      if (custom.detail?.session_token) {
        setUserConfig((prev) =>
          prev ? { ...prev, session_token: custom.detail.session_token } : prev
        );
      }
    };
    window.addEventListener('revolt:session-token-updated', handleTokenUpdated);
    return () => window.removeEventListener('revolt:session-token-updated', handleTokenUpdated);
  }, []);

  // Listen for vault synchronization events from background sync / conflict resolution
  useEffect(() => {
    const handleVaultSynced = (e: Event) => {
      const custom = e as CustomEvent<{ version: number; items?: VaultItem[] }>;
      if (custom.detail?.items) {
        const cleanItems = deduplicateVaultItems(custom.detail.items);
        setItems(cleanItems);
        if (custom.detail.version) {
          setVaultVersion(custom.detail.version);
        }
      }
    };
    window.addEventListener('revolt:vault-synced', handleVaultSynced);
    return () => window.removeEventListener('revolt:vault-synced', handleVaultSynced);
  }, []);

  // Listen for multi-account migration QR scan event
  useEffect(() => {
    const handleOpenMigration = () => {
      setIsQrModalOpen(false);
      setIsBackupOpen(true);
    };
    window.addEventListener('revolt:open-import-migration', handleOpenMigration);
    return () => window.removeEventListener('revolt:open-import-migration', handleOpenMigration);
  }, []);


  // Listen for PWA installation event (beforeinstallprompt)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      toast.success(t('toasts.pwaInstalled'));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [t]);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success(t('toasts.pwaInstalling'));
    }
    setInstallPrompt(null);
  };

  // Owner shortcut toggle (Ctrl+Shift+U or Ctrl+Alt+U or Cmd+Shift/Alt+U)
  const toggleMasterAccess = useCallback(() => {
    setIsMasterAccessUnlocked((prev) => {
      const next = !prev;
      if (next) {
        toast.info(t('auth.masterAccessUnlocked'));
      } else {
        toast.info(t('auth.masterAccessLocked'));
      }
      return next;
    });
  }, [t]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUKey = e.code === 'KeyU' || e.key?.toLowerCase() === 'u';
      const hasModifier = (e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey);

      if (isUKey && hasModifier) {
        e.preventDefault();
        e.stopPropagation();
        toggleMasterAccess();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [toggleMasterAccess]);

  const shieldClickCountRef = useRef(0);
  const shieldClickTimerRef = useRef<number | null>(null);

  const handleShieldMultiClick = useCallback(() => {
    shieldClickCountRef.current += 1;
    if (shieldClickTimerRef.current) {
      window.clearTimeout(shieldClickTimerRef.current);
    }
    if (shieldClickCountRef.current >= 3) {
      shieldClickCountRef.current = 0;
      toggleMasterAccess();
    } else {
      shieldClickTimerRef.current = window.setTimeout(() => {
        shieldClickCountRef.current = 0;
      }, 1200);
    }
  }, [toggleMasterAccess]);

  // -------------------------------------------------------------------------
  // Real-time Master Password Entropy Calculation
  // -------------------------------------------------------------------------
  const passwordEntropy = useMemo(() => {
    if (!regPassword) {
      return { bits: 0, level: 0, label: '', color: '' };
    }

    let pool = 0;
    if (/[a-z]/.test(regPassword)) pool += 26;
    if (/[A-Z]/.test(regPassword)) pool += 26;
    if (/[0-9]/.test(regPassword)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(regPassword)) pool += 33;

    const bits = pool > 0 ? Math.round(regPassword.length * Math.log2(pool)) : 0;

    if (bits < 40 || regPassword.length < 8) {
      return { bits, level: 1, label: t('auth.strengthWeak'), color: 'text-rose-400' };
    } else if (bits < 60) {
      return { bits, level: 2, label: t('auth.strengthFair'), color: 'text-amber-400' };
    } else if (bits < 80) {
      return { bits, level: 3, label: t('auth.strengthGood'), color: 'text-emerald-400' };
    } else {
      return { bits, level: 4, label: t('auth.strengthArmored', { bits }), color: 'text-emerald-300' };
    }
  }, [regPassword, t]);

  // -------------------------------------------------------------------------
  // 1. Application Initialization & State Detection (Mount only)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      // 1. Check WebAuthn support on the current device
      const webauthn = await checkWebAuthnSupport();
      if (isMounted) setHasPasskeySupport(webauthn.hasPlatformAuthenticator);

      // 2. Synchronize time drift with server in the background
      syncTimeWithServer().catch(() => {});

      // 3. Subscribe to sync state and network connectivity
      const unsubSync = onSyncStateChange((status) => {
        if (isMounted) setSyncStatusState(status);
      });

      const unsubNet = initNetworkSyncListeners(
        () => {
          toast.info(t('toasts.connectionRestored'));
          if (masterKeyRef.current) pushLocalVault('', masterKeyRef.current);
        },
        () => {
          toast.warning(t('toasts.offlineMode'));
        }
      );

      // 4. Load local profile from IndexedDB
      try {
        const config = await getUserConfig();
        if (!config || !config.user_id) {
          if (isMounted) {
            setScreen('register');
          }
        } else {
          if (isMounted) {
            setUserConfig(config);
            setScreen('locked');

            // Auto-sync local passkey to remote server if present
            if (config.webauthn_credential_id && config.user_id) {
              fetch('/api/passkeys', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-User-Id': config.user_id,
                  ...(config.session_token ? { 'X-Session-Token': config.session_token } : {}),
                },
                body: JSON.stringify({
                  credential_id: config.webauthn_credential_id,
                  name: config.passkey_name || 'Windows Hello / Dispositivo Principal',
                }),
              }).catch(() => {});
            }
          }
        }
      } catch {
        if (isMounted) {
          setScreen('register');
        }
      }

      return () => {
        unsubSync();
        unsubNet();
      };
    }

    initApp();

    return () => {
      isMounted = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Memory Auto-lock on Inactivity (5 min) and Visibility Change (30s)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (screen !== 'unlocked' || !masterKey) return;

    const timeoutMinutes = userConfig?.auto_lock_minutes ?? 5;
    const autoLock = new AutoLockManager({
      inactivityTimeoutMs: timeoutMinutes * 60 * 1000,
      backgroundGraceMs: 30 * 1000,
    });

    autoLock.start(() => {
      setMasterKey(null);
      setScreen('locked');
      toast.info('Sesión bloqueada por inactividad. Claves purgadas de memoria RAM.');
    });

    return () => {
      autoLock.stop();
    };
  }, [screen, masterKey, userConfig?.auto_lock_minutes]);

  // -------------------------------------------------------------------------
  // Reactive Multi-Device Sync: Focus, Visibility Change & 30s Polling
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (screen !== 'unlocked' || !masterKey) return;

    const triggerBackgroundSync = () => {
      if (document.visibilityState === 'visible') {
        pullRemoteVault('', masterKey).then((res) => {
          if (res.pulled && res.items) {
            const cleanRemote = deduplicateVaultItems(res.items);
            setItems(cleanRemote);
            if (res.version) setVaultVersion(res.version);
          }
        }).catch(() => {});
      }
    };

    window.addEventListener('focus', triggerBackgroundSync);
    document.addEventListener('visibilitychange', triggerBackgroundSync);
    const interval = window.setInterval(triggerBackgroundSync, 30000);

    return () => {
      window.removeEventListener('focus', triggerBackgroundSync);
      document.removeEventListener('visibilitychange', triggerBackgroundSync);
      window.clearInterval(interval);
    };
  }, [screen, masterKey]);

  // Universal shortcut Ctrl + K / Cmd + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (screen === 'unlocked') {
          setIsCmdPaletteOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen]);

  // Master access toggle shortcut: Ctrl + Shift + U (or Cmd + Shift + U)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        setIsMasterAccessUnlocked((prev) => {
          const next = !prev;
          if (next) {
            toast.info(t('auth.masterAccessUnlocked'));
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [t]);

  // -------------------------------------------------------------------------
  // 2. Login / Existing Vault Linking (Multi-Device)
  // -------------------------------------------------------------------------
  const handleLoginExisting = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanUsername = loginUsername.trim().toLowerCase();
    if (!cleanUsername) {
      toast.error(t('toasts.enterUsername'));
      return;
    }

    if (!loginPassword) {
      toast.error(t('toasts.enterMasterPassword'));
      return;
    }

    setIsAuthenticating(true);
    try {
      // 1. Fetch user salt from Cloudflare D1
      const saltRes = await fetch(`/api/auth/salt?username=${encodeURIComponent(cleanUsername)}`);
      if (!saltRes.ok) {
        if (saltRes.status === 404) {
          throw new Error(`El usuario "${cleanUsername}" no existe en el servidor. Verifica el nombre o crea una nueva bóveda.`);
        }
        const errJson = (await saltRes.json().catch(() => ({}))) as ApiResponse<unknown>;
        throw new Error(errJson?.error?.message || 'Error al consultar el usuario en el servidor');
      }

      const saltData = (await saltRes.json()) as ApiResponse<{
        user_id: string;
        kdf_salt: string;
        has_passkey: boolean;
      }>;

      if (!saltData.data?.user_id || !saltData.data?.kdf_salt) {
        throw new Error('Respuesta del servidor inválida al obtener el salt.');
      }

      const { user_id, kdf_salt } = saltData.data;

      // 2. Derive MasterKey via PBKDF2 600k rounds using remote salt
      const saltBytes = Uint8Array.from(atob(kdf_salt), (c) => c.charCodeAt(0));
      const key = await deriveMasterKey(loginPassword, saltBytes, 600000);

      // 3. Download encrypted vault from Cloudflare D1
      const vaultRes = await fetch('/api/vault', {
        headers: {
          'X-User-Id': user_id,
        },
      });

      if (!vaultRes.ok) {
        throw new Error('No se pudo descargar la bóveda desde el servidor.');
      }

      const vaultData = (await vaultRes.json()) as ApiResponse<{
        user_id: string;
        encrypted_blob: string;
        iv: string;
        version: number;
        updated_at: number;
      }>;

      if (!vaultData.data?.encrypted_blob || !vaultData.data?.iv) {
        throw new Error('La bóveda remota no contiene datos válidos.');
      }

      const remoteVault = vaultData.data;

      // 4. Attempt to decrypt vault with derived key (Zero-Knowledge verification)
      let decryptedItems: VaultItem[] = [];
      try {
        decryptedItems = await decryptVault(
          remoteVault.encrypted_blob,
          remoteVault.iv,
          key
        );
      } catch {
        throw new Error('Contraseña Maestra incorrecta');
      }

      // 5. Establish active session token upon login
      let sessionToken: string | undefined;
      try {
        const sesRes = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': user_id },
          body: JSON.stringify({ user_id }),
        });
        if (sesRes.ok) {
          const sesData = (await sesRes.json()) as ApiResponse<{ session_token: string }>;
          if (sesData.data?.session_token) {
            sessionToken = sesData.data.session_token;
          }
        }
      } catch {
        // Non-blocking
      }

      // 6. Save profile and vault into local IndexedDB
      const config: LocalUserConfig = {
        user_id,
        username: cleanUsername,
        kdf_salt,
        session_token: sessionToken,
        auto_lock_minutes: 5,
        clipboard_clear_seconds: 45,
      };

      await saveUserConfig(config);
      await saveLocalVault({
        user_id,
        encrypted_blob: remoteVault.encrypted_blob,
        iv: remoteVault.iv,
        version: remoteVault.version,
        updated_at: remoteVault.updated_at,
        sync_status: 'synced',
      });

      const cleanItems = deduplicateVaultItems(decryptedItems);
      setUserConfig(config);
      setMasterKey(key);
      setItems(cleanItems);
      setVaultVersion(remoteVault.version);
      setLoginPassword('');
      setScreen('unlocked');

      toast.success(t('toasts.vaultLinked'), {
        description: t('toasts.vaultLinkedDesc', { count: decryptedItems.length }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión';
      toast.error(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 3. Initial User & Vault Registration (Zero-Knowledge)
  // -------------------------------------------------------------------------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanUsername = regUsername.trim().toLowerCase();
    if (!cleanUsername) {
      toast.error(t('toasts.enterUsername'));
      return;
    }

    if (cleanUsername.length < 3) {
      toast.error(t('auth.usernameRequired'));
      return;
    }

    if (regPassword.length < 8) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }

    if (regPassword !== regConfirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }

    setIsAuthenticating(true);
    try {
      // 1. Generate 16-byte salt and derive MasterKey via Web Worker (PBKDF2 600k)
      const salt = generateSalt(16);
      const saltBase64 = btoa(String.fromCharCode(...salt));
      const key = await deriveMasterKey(regPassword, salt, 600000);

      // 2. Encrypt empty initial vault
      const initialEnc = await encryptVault([], key, 1);

      // 3. Register user in Cloudflare D1
      let userId = `usr_${crypto.randomUUID()}`;
      let sessionToken: string | undefined = undefined;
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          kdf_salt: saltBase64,
          encrypted_blob: initialEnc.encryptedBlob,
          iv: initialEnc.iv,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as ApiResponse<unknown>;
        if (res.status === 409) {
          throw new Error(
            `El usuario "${cleanUsername}" ya existe en el servidor. Selecciona la pestaña "Iniciar Sesión" para vincular tu bóveda.`
          );
        }
        throw new Error(errData?.error?.message || 'Error al registrar en el servidor');
      }

      const resJson = (await res.json()) as ApiResponse<{ user_id: string; session_token?: string }>;
      if (resJson.data?.user_id) userId = resJson.data.user_id;
      if (resJson.data?.session_token) sessionToken = resJson.data.session_token;

      // 4. Save configuration and initial vault into IndexedDB
      const config: LocalUserConfig = {
        user_id: userId,
        username: cleanUsername,
        kdf_salt: saltBase64,
        session_token: sessionToken,
        auto_lock_minutes: 5,
        clipboard_clear_seconds: 45,
      };

      await saveUserConfig(config);
      await saveLocalVault({
        user_id: userId,
        encrypted_blob: initialEnc.encryptedBlob,
        iv: initialEnc.iv,
        version: 1,
        updated_at: initialEnc.updatedAt,
        sync_status: 'synced',
      });

      setUserConfig(config);
      setMasterKey(key);
      setItems([]);
      setVaultVersion(1);
      setScreen('unlocked');

      toast.success(t('toasts.vaultCreated'), {
        description: t('toasts.vaultCreatedDesc'),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar la bóveda';
      toast.error(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Session & Passkey Synchronization Helpers
  // -------------------------------------------------------------------------
  const syncSessionAndDevice = useCallback(
    async (cfg: LocalUserConfig, options?: { passkeyId?: string }) => {
      if (!cfg.user_id) return cfg;
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-User-Id': cfg.user_id,
        };
        if (cfg.session_token) {
          headers['X-Session-Token'] = cfg.session_token;
        }

        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: cfg.user_id,
            session_token: cfg.session_token,
            device_name: cfg.device_name,
            passkey_id: options?.passkeyId,
          }),
        });

        if (res.ok) {
          const resData = (await res.json()) as ApiResponse<{ session_token: string }>;
          if (resData.success && resData.data?.session_token) {
            const newToken = resData.data.session_token;
            if (cfg.session_token !== newToken) {
              const updated: LocalUserConfig = { ...cfg, session_token: newToken };
              await saveUserConfig(updated);
              setUserConfig(updated);
              return updated;
            }
          }
        }
      } catch {
        // Non-blocking background sync
      }
      return cfg;
    },
    []
  );

  const syncLocalPasskey = useCallback(
    async (cfg: LocalUserConfig) => {
      if (!cfg.user_id || !cfg.webauthn_credential_id) return;
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-User-Id': cfg.user_id,
        };
        if (cfg.session_token) {
          headers['X-Session-Token'] = cfg.session_token;
        }
        await fetch('/api/passkeys', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            credential_id: cfg.webauthn_credential_id,
            name: cfg.passkey_name || 'Windows Hello / Dispositivo Principal',
          }),
        });
      } catch {
        // Non-blocking background sync
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // 4. Vault Unlock with Master Password
  // -------------------------------------------------------------------------
  const handleUnlockWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userConfig || !unlockPassword) return;

    setIsAuthenticating(true);
    try {
      // 1. Derive master key from stored salt
      const saltBytes = Uint8Array.from(atob(userConfig.kdf_salt), (c) => c.charCodeAt(0));
      const key = await deriveMasterKey(unlockPassword, saltBytes, 600000);

      // 2. Retrieve local vault from IndexedDB
      const localVault = await getLocalVault();
      if (!localVault) {
        throw new Error('No se encontró ninguna bóveda local almacenada.');
      }

      // 3. Decrypt vault with AES-GCM-256
      const decryptedItems = await decryptVault(
        localVault.encrypted_blob,
        localVault.iv,
        key
      );

      const cleanItems = deduplicateVaultItems(decryptedItems);

      setMasterKey(key);
      setItems(cleanItems);
      setVaultVersion(localVault.version);
      setUnlockPassword('');
      setScreen('unlocked');

      toast.success(t('toasts.vaultUnlocked'));

      // If duplicate accounts were pruned, persist and push the clean vault immediately
      if (cleanItems.length !== decryptedItems.length) {
        const nextVer = localVault.version + 1;
        setVaultVersion(nextVer);
        encryptVault(cleanItems, key, nextVer).then(async (enc) => {
          await saveLocalVault({
            user_id: userConfig.user_id,
            encrypted_blob: enc.encryptedBlob,
            iv: enc.iv,
            version: nextVer,
            updated_at: enc.updatedAt,
            sync_status: 'dirty',
          });
          pushLocalVault('', key).catch(() => {});
        }).catch(console.error);
      }

      // 4. Refresh or touch active session in background without creating duplicates
      syncSessionAndDevice(userConfig).catch(() => {});
      if (userConfig.webauthn_credential_id) {
        syncLocalPasskey(userConfig).catch(() => {});
      }

      // 5. Attempt remote synchronization in the background
      pullRemoteVault('', key).then((res) => {
        if (res.pulled && res.items) {
          const cleanRemote = deduplicateVaultItems(res.items);
          setItems(cleanRemote);
          if (res.version) setVaultVersion(res.version);
        }
      }).catch(() => {});
    } catch (err: unknown) {
      toast.error(t('toasts.authError'));
      console.error(err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 5. Fast Unlock with Windows Hello / WebAuthn Biometrics
  // -------------------------------------------------------------------------
  const handleUnlockWithPasskey = async () => {
    if (!userConfig?.wrapped_master_key || !userConfig.webauthn_credential_id) {
      toast.error(t('toasts.passkeyNotConfigured'));
      return;
    }

    setIsAuthenticating(true);
    try {
      // 1. Strictly enforce physical OS prompt (Windows Hello PIN or Biometrics)
      const verified = await verifyPlatformPasskey(userConfig.webauthn_credential_id);
      if (!verified) {
        toast.error(t('toasts.passkeyAuthError'));
        return;
      }

      // 2. Unwrap master key protected by platform authenticator key
      const wrappedPkg = JSON.parse(userConfig.wrapped_master_key) as WrappedKeyPackage;
      const key = await unwrapMasterKey(
        wrappedPkg,
        userConfig.webauthn_credential_id
      );

      const localVault = await getLocalVault();
      if (!localVault) throw new Error('Bóveda local no encontrada.');

      const decryptedItems = await decryptVault(
        localVault.encrypted_blob,
        localVault.iv,
        key
      );

      const cleanItems = deduplicateVaultItems(decryptedItems);

      setMasterKey(key);
      setItems(cleanItems);
      setVaultVersion(localVault.version);
      setScreen('unlocked');

      toast.success(t('toasts.passkeyUnlocked'));

      if (cleanItems.length !== decryptedItems.length) {
        const nextVer = localVault.version + 1;
        setVaultVersion(nextVer);
        encryptVault(cleanItems, key, nextVer).then(async (enc) => {
          await saveLocalVault({
            user_id: userConfig.user_id,
            encrypted_blob: enc.encryptedBlob,
            iv: enc.iv,
            version: nextVer,
            updated_at: enc.updatedAt,
            sync_status: 'dirty',
          });
          pushLocalVault('', key).catch(() => {});
        }).catch(console.error);
      }

      // 3. Refresh or touch active session and record passkey usage timestamp
      syncSessionAndDevice(userConfig, { passkeyId: userConfig.webauthn_credential_id }).catch(() => {});
      syncLocalPasskey(userConfig).catch(() => {});

      pullRemoteVault('', key).then((res) => {
        if (res.pulled && res.items) {
          const cleanRemote = deduplicateVaultItems(res.items);
          setItems(cleanRemote);
          if (res.version) setVaultVersion(res.version);
        }
      }).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en la verificación biométrica';
      toast.error(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 6. Link Windows Hello PIN or Biometrics
  // -------------------------------------------------------------------------
  const handleSetupPasskey = async () => {
    if (!masterKey || !userConfig) return;

    try {
      toast.info(t('toasts.passkeyRequesting'));
      const reg = await registerPlatformPasskey(userConfig.user_id, userConfig.username);
      const wrappedPkg = await wrapMasterKey(masterKey, reg.credentialId);

      // Register passkey in remote database if online
      if (userConfig.user_id) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-User-Id': userConfig.user_id,
        };
        if (userConfig.session_token) {
          headers['X-Session-Token'] = userConfig.session_token;
        }
        const passkeyName = userConfig.passkey_name || 'Windows Hello / Dispositivo Local';
        fetch('/api/passkeys', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            credential_id: reg.credentialId,
            name: passkeyName,
          }),
        }).catch(() => {});
      }

      const updatedConfig: LocalUserConfig = {
        ...userConfig,
        webauthn_credential_id: reg.credentialId,
        wrapped_master_key: JSON.stringify(wrappedPkg),
        passkey_name: userConfig.passkey_name || 'Windows Hello / Dispositivo Local',
      };

      await saveUserConfig(updatedConfig);
      setUserConfig(updatedConfig);

      toast.success(t('toasts.passkeyLinked'), {
        description: t('toasts.passkeyLinkedDesc'),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al vincular passkey';
      toast.error(msg);
    }
  };

  // -------------------------------------------------------------------------
  // 7. Manual Vault Lock (Strict RAM Purge)
  // -------------------------------------------------------------------------
  const handleLockVault = useCallback(() => {
    setMasterKey(null);
    setScreen('locked');
    toast.info(t('toasts.lockedManual'));
  }, [t]);

  // -------------------------------------------------------------------------
  // 8. Account Persistence & Updates
  // -------------------------------------------------------------------------
  const persistVaultChanges = async (newItems: VaultItem[]) => {
    if (!masterKey || !userConfig) return;

    const newVersion = vaultVersion + 1;
    setVaultVersion(newVersion);
    setItems(newItems);

    try {
      const enc = await encryptVault(newItems, masterKey, newVersion);
      await saveLocalVault({
        user_id: userConfig.user_id,
        encrypted_blob: enc.encryptedBlob,
        iv: enc.iv,
        version: newVersion,
        updated_at: enc.updatedAt,
        sync_status: 'dirty',
      });

      // Trigger asynchronous synchronization to Cloudflare D1
      pushLocalVault('', masterKey).catch(() => {});
    } catch (err: unknown) {
      console.error('Error al persistir cambios de la bóveda:', err);
      toast.error(t('toasts.saveChangesError'));
    }
  };

  const handleSaveNewAccount = async (newItem: VaultItem) => {
    startTransition(async () => {
      const updated = [newItem, ...items];
      await persistVaultChanges(updated);
      toast.success(t('toasts.accountSaved', { issuer: newItem.issuer }));
    });
  };

  const handleUpdateAccount = async (updatedItem: VaultItem) => {
    startTransition(async () => {
      const updated = items.map((item) =>
        item.id === updatedItem.id ? { ...updatedItem, updated_at: Date.now() } : item
      );
      await persistVaultChanges(updated);
      toast.success(t('toasts.accountUpdated', { issuer: updatedItem.issuer }));
    });
  };

  const handleOpenEditAccount = (item: VaultItem) => {
    setEditingItem(item);
    setIsEditModalOpen(true);
  };

  const handleTogglePin = async (id: string) => {
    startTransition(async () => {
      const updated = items.map((item) =>
        item.id === id ? { ...item, pinned: !item.pinned, updated_at: Date.now() } : item
      );
      await persistVaultChanges(updated);
    });
  };

  const handleDeleteAccount = async (id: string) => {
    startTransition(async () => {
      const updated = items.filter((item) => item.id !== id);
      await persistVaultChanges(updated);
      toast.info(t('toasts.accountDeleted'));
    });
  };

  const handleToggleRecoveryCode = async (id: string, codeIdx: number) => {
    startTransition(async () => {
      const updated = items.map((item) => {
        if (item.id !== id || !item.recovery_codes) return item;
        const codes = [...item.recovery_codes];
        codes[codeIdx] = { ...codes[codeIdx], used: !codes[codeIdx].used };
        return { ...item, recovery_codes: codes, updated_at: Date.now() };
      });
      await persistVaultChanges(updated);
    });
  };

  // -------------------------------------------------------------------------
  // 9. Vault Restoration from BackupModal
  // -------------------------------------------------------------------------
  const handleVaultRestored = async (newItems: VaultItem[]) => {
    await persistVaultChanges(newItems);
  };

  // -------------------------------------------------------------------------
  // 10. Manual Cloud Synchronization Trigger
  // -------------------------------------------------------------------------
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const handleManualSync = useCallback(async () => {
    if (!masterKey || isManualSyncing) return;
    setIsManualSyncing(true);
    toast.info(t('toasts.syncing'));
    try {
      const cleanLocal = deduplicateVaultItems(items);
      if (cleanLocal.length !== items.length) {
        await persistVaultChanges(cleanLocal);
      } else {
        await pushLocalVault('', masterKey);
      }
      const res = await pullRemoteVault('', masterKey);
      if (res.pulled && res.items) {
        const cleanRemote = deduplicateVaultItems(res.items);
        setItems(cleanRemote);
        if (res.version) setVaultVersion(res.version);
        toast.success(t('toasts.syncSuccess'));
      } else {
        toast.success(t('toasts.alreadySynced'));
      }
    } catch {
      toast.error(t('toasts.syncError'));
    } finally {
      setIsManualSyncing(false);
    }
  }, [masterKey, items, isManualSyncing, t]);

  // -------------------------------------------------------------------------
  // RENDER: INITIAL LOADING SCREEN
  // -------------------------------------------------------------------------
  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-[#08090a] flex flex-col items-center justify-center p-6 text-zinc-100">
        <div className="h-10 w-10 rounded-lg bg-[#101214] border border-white/[0.1] hairline-top flex items-center justify-center mb-4 text-zinc-300">
          <Shield className="w-5 h-5 animate-pulse text-white" />
        </div>
        <p className="text-[11px] text-zinc-500 font-mono tracking-wider uppercase">
          {t('auth.initializing')}
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: INITIAL ACCESS / REGISTRATION SCREEN
  // -------------------------------------------------------------------------
  if (screen === 'register') {
    const isConfirmMatch =
      regPassword.length > 0 && regConfirmPassword.length > 0 && regPassword === regConfirmPassword;
    const isAccessAllowed = !IS_PRIVATE_INSTANCE || !!userConfig || isMasterAccessUnlocked;

    return (
      <div className="min-h-screen bg-[#08090a] flex flex-col items-center justify-center p-4 sm:p-6 text-zinc-100 selection:bg-white/20 selection:text-white">
        <Toaster position="bottom-right" richColors theme="dark" />

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md bg-[#0f1013] border border-white/[0.08] hairline-top shadow-[0_24px_50px_rgba(0,0,0,0.8)] rounded-xl p-6 sm:p-7 overflow-hidden z-10"
        >
          <div className="absolute top-4 right-4 z-40">
            <LanguageSwitcher />
          </div>

          {/* Restricted Private Instance Overlay (only active when IS_PRIVATE_INSTANCE && !isAccessAllowed) */}
          {IS_PRIVATE_INSTANCE && !isAccessAllowed && (
            <div className="absolute inset-0 z-30 bg-[#0f1013]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none cursor-default">
              <div
                onClick={handleShieldMultiClick}
                role="button"
                tabIndex={-1}
                aria-label="Security Status"
                className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center mb-4 text-zinc-400 shadow-inner cursor-pointer active:scale-95 transition-transform select-none"
              >
                <ShieldAlert className="w-6 h-6 text-zinc-300 pointer-events-none" />
              </div>

              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-zinc-400 bg-white/[0.03] border border-white/[0.06] px-2.5 py-0.5 rounded-md mb-3">
                RESTRICTED ACCESS
              </div>

              <h2 className="text-base font-semibold tracking-tight text-white mb-2 max-w-xs">
                {t('auth.privateInstanceTitle')}
              </h2>

              <p className="text-xs text-zinc-400 leading-relaxed max-w-xs">
                {t('auth.privateInstanceSubtitle')}
              </p>
            </div>
          )}

          {/* App Card Content: grayish and inert when locked */}
          <div
            className={`flex flex-col items-center text-center transition-all duration-200 ${
              IS_PRIVATE_INSTANCE && !isAccessAllowed
                ? 'filter grayscale opacity-25 pointer-events-none select-none contrast-75'
                : ''
            }`}
          >
            {/* Back button if local profile exists */}
            {userConfig && (
              <div className="w-full flex justify-start mb-3">
                <button
                  type="button"
                  onClick={() => setScreen('locked')}
                  className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1.5 transition-colors py-1 px-2 rounded-md hover:bg-white/[0.05]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('auth.backToVault', { username: userConfig.username })}</span>
                </button>
              </div>
            )}

            {/* Brand Logo */}
            <div className="h-10 w-10 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top flex items-center justify-center mb-3 text-white">
              <Shield className="w-5 h-5 text-white" />
            </div>

            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-zinc-400 bg-white/[0.03] border border-white/[0.06] px-2.5 py-0.5 rounded-md mb-2">
              {t('auth.zeroKnowledgeBadge')}
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-white mb-1">
              {t('auth.welcomeTitle')}
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto mb-5">
              {(IS_PRIVATE_INSTANCE && !isMasterAccessUnlocked) || authMode === 'login'
                ? t('auth.welcomeSubtitleLogin')
                : t('auth.welcomeSubtitleRegister')}
            </p>

            {/* Mode Selector (visible on open instances OR when owner unlocks private instance) */}
            {(!IS_PRIVATE_INSTANCE || isMasterAccessUnlocked) && (
              <div className="w-full grid grid-cols-2 p-1 bg-[#08090a] border border-white/[0.06] rounded-lg mb-5 text-xs">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`py-1.5 font-medium rounded-md flex items-center justify-center gap-2 transition-all ${
                    authMode === 'login'
                      ? 'bg-[#1c1f24] text-white shadow-sm border border-white/[0.08]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('auth.loginTab')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`py-1.5 font-medium rounded-md flex items-center justify-center gap-2 transition-all ${
                    authMode === 'register'
                      ? 'bg-[#1c1f24] text-white shadow-sm border border-white/[0.08]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t('auth.registerTab')}</span>
                </button>
              </div>
            )}

            {/* FORM 1: LOG IN */}
            {((IS_PRIVATE_INSTANCE && !isMasterAccessUnlocked) || authMode === 'login') && (
              <form onSubmit={handleLoginExisting} className="w-full space-y-3.5 text-left text-xs">
                <div>
                  <label className="font-medium text-zinc-300 mb-1.5 block">
                    {t('auth.usernameLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder={t('auth.usernamePlaceholder')}
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="w-full bg-[#08090a] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg py-2 pl-9 pr-3 text-xs focus:border-white/30 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-medium text-zinc-300 mb-1.5 block">
                    {t('auth.passwordLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                      <KeyRound className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      placeholder={t('auth.passwordPlaceholder')}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-[#08090a] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg py-2 pl-9 pr-9 text-xs focus:border-white/30 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showLoginPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full mt-2 bg-white text-black font-medium hover:bg-zinc-200 active:scale-[0.99] transition-all rounded-lg py-2.5 px-4 text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                      <span>{t('auth.authenticating')}</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-black" />
                      <span>{t('auth.loginButton')}</span>
                    </>
                  )}
                </button>

                {(!IS_PRIVATE_INSTANCE || isMasterAccessUnlocked) && (
                  <div className="text-center pt-2">
                    <span className="text-[11px] text-zinc-500">
                      {t('auth.noAccountPrompt')}{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('register')}
                        className="text-zinc-300 hover:text-white underline underline-offset-4"
                      >
                        {t('auth.createVaultPrompt')}
                      </button>
                    </span>
                  </div>
                )}
              </form>
            )}

            {/* FORM 2: REGISTER */}
            {(!IS_PRIVATE_INSTANCE || isMasterAccessUnlocked) && authMode === 'register' && (
              <form onSubmit={handleRegister} className="w-full space-y-3.5 text-left text-xs">
                <div>
                  <label className="font-medium text-zinc-300 mb-1.5 block">
                    {t('auth.usernameLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder={t('auth.usernamePlaceholder')}
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className="w-full bg-[#08090a] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg py-2 pl-9 pr-3 text-xs focus:border-white/30 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-medium text-zinc-300 mb-1.5 block">
                    {t('auth.passwordLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                      <KeyRound className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full bg-[#08090a] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg py-2 pl-9 pr-9 text-xs focus:border-white/30 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {regPassword.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-zinc-500">{t('auth.strengthLabel')}</span>
                        <span className={passwordEntropy.color}>{passwordEntropy.label}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 h-1">
                        {[1, 2, 3, 4].map((seg) => (
                          <div
                            key={seg}
                            className={`h-full rounded-full transition-all duration-300 ${
                              passwordEntropy.level >= seg
                                ? passwordEntropy.level === 1
                                  ? 'bg-rose-500'
                                  : passwordEntropy.level === 2
                                  ? 'bg-amber-500'
                                  : passwordEntropy.level === 3
                                  ? 'bg-emerald-500'
                                  : 'bg-emerald-400'
                                : 'bg-white/[0.06]'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-medium text-zinc-300 mb-1.5 block">
                    {t('auth.confirmPasswordLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder={t('auth.passwordPlaceholder')}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full bg-[#08090a] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg py-2 pl-9 pr-14 text-xs focus:border-white/30 focus:outline-none transition-colors"
                    />
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
                      {isConfirmMatch && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {showRegConfirmPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full mt-2 bg-white text-black font-medium hover:bg-zinc-200 active:scale-[0.99] transition-all rounded-lg py-2.5 px-4 text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                      <span>{t('auth.creatingVault')}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-black" />
                      <span>{t('auth.registerButton')}</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <span className="text-[11px] text-zinc-500">
                    {t('auth.alreadyAccountPrompt')}{' '}
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="text-zinc-300 hover:text-white underline underline-offset-4"
                    >
                      {t('auth.loginHerePrompt')}
                    </button>
                  </span>
                </div>
              </form>
            )}

            {/* Footer Trust Badges */}
            <div className="w-full mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t('auth.aesNotice')}
              </span>
              <span>{t('auth.pbkdf2Notice')}</span>
              <span>{t('auth.clientSideOnly')}</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: LOCK SCREEN
  // -------------------------------------------------------------------------
  if (screen === 'locked') {
    const hasFastUnlock = !!userConfig?.wrapped_master_key;

    return (
      <div className="min-h-screen bg-[#08090a] flex flex-col items-center justify-center p-4 sm:p-6 text-zinc-100 selection:bg-white/20 selection:text-white">
        <Toaster position="bottom-right" richColors theme="dark" />

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-sm bg-[#0f1013] border border-white/[0.08] hairline-top shadow-[0_24px_50px_rgba(0,0,0,0.8)] rounded-xl p-6 sm:p-7 overflow-hidden z-10"
        >
          <div className="absolute top-4 right-4 z-20">
            <LanguageSwitcher />
          </div>

          <div className="flex flex-col items-center text-center">
            {/* Brand Logo */}
            <div className="h-10 w-10 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top flex items-center justify-center mb-3 text-white">
              <Lock className="w-5 h-5 text-white" />
            </div>

            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-zinc-400 bg-white/[0.03] border border-white/[0.06] px-2.5 py-0.5 rounded-md mb-2">
              {t('auth.sessionLockedBadge')}
            </div>

            <h1 className="text-xl font-semibold text-white mb-0.5">Revolt Pass</h1>
            <p className="text-xs text-zinc-400 mb-5 font-mono">
              {t('auth.userLabel')}: <strong className="text-white">{userConfig?.username}</strong>
            </p>

            {/* Option 1: Fast Unlock with Windows Hello / PIN */}
            {hasFastUnlock && (
              <div className="w-full mb-4">
                <button
                  type="button"
                  onClick={handleUnlockWithPasskey}
                  disabled={isAuthenticating}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#16181d] hover:bg-[#1c1f24] text-white font-medium text-xs border border-white/[0.08] shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <Fingerprint className="w-4 h-4 text-zinc-300" />
                  <span>{t('auth.windowsHelloButton')}</span>
                </button>

                <div className="flex items-center my-3.5 text-xs text-zinc-600">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="px-2.5 font-mono text-[10px] text-zinc-500 uppercase">{t('auth.orMasterPassword')}</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
              </div>
            )}

            {/* Option 2: Unlock with Master Password */}
            <form onSubmit={handleUnlockWithPassword} className="w-full space-y-3 text-xs">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
                <input
                  type={showUnlockPassword ? 'text' : 'password'}
                  required
                  placeholder={t('auth.passwordPlaceholder')}
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  className="w-full bg-[#08090a] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg py-2 pl-9 pr-9 text-xs focus:border-white/30 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowUnlockPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showUnlockPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-2.5 px-4 bg-white hover:bg-zinc-200 text-black font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-sm disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    <span>{t('auth.unlocking')}</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-black" />
                    <span>{t('auth.unlockButton')}</span>
                  </>
                )}
              </button>
            </form>

            {/* Switch Account */}
            <div className="w-full mt-4 text-center">
              <button
                type="button"
                onClick={() => setScreen('register')}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors underline-offset-4 hover:underline inline-flex items-center gap-1.5"
              >
                <User className="w-3 h-3" />
                <span>{t('auth.switchAccount')}</span>
              </button>
            </div>

            {/* Footer */}
            <div className="w-full mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t('auth.aesNotice')}
              </span>
              <span>{t('auth.zeroKnowledge')}</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: MAIN SCREEN (UNLOCKED VAULT)
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 flex flex-col selection:bg-white/20 selection:text-white relative">
      <Toaster position="bottom-right" richColors theme="dark" />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#08090a]/90 backdrop-blur-md px-3 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo and Branding */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top flex items-center justify-center text-white shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-semibold text-sm text-white tracking-tight truncate">
                  Revolt Pass
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono px-1 sm:px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-zinc-400 shrink-0">
                  {VERSION_NAME}
                </span>
              </div>
            </div>
          </div>

          {/* Top Actions and Sync Status */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Sync Status Pill / Manual Sync Button */}
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isManualSyncing}
              className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 rounded-md text-[11px] font-mono border transition-all active:scale-[0.98] ${
                isManualSyncing || syncStatus === 'syncing' || syncStatus === 'dirty'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                  : syncStatus === 'synced'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
              }`}
              title={isManualSyncing ? 'Sincronizando con la nube...' : 'Estado de sincronización (Clic para sincronizar ahora)'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isManualSyncing || syncStatus === 'syncing' || syncStatus === 'dirty'
                    ? 'bg-amber-400 animate-ping'
                    : syncStatus === 'synced'
                    ? 'bg-emerald-400'
                    : 'bg-rose-400'
                }`}
              />
              <span className="hidden sm:inline capitalize font-sans text-xs">
                {isManualSyncing
                  ? 'Sincronizando...'
                  : syncStatus === 'synced'
                  ? t('nav.synced')
                  : syncStatus === 'syncing'
                  ? t('nav.syncing')
                  : syncStatus === 'dirty'
                  ? t('nav.dirty')
                  : t('nav.syncError')}
              </span>
            </button>

            {/* Command Palette Button */}
            <button
              type="button"
              onClick={() => setIsCmdPaletteOpen(true)}
              className="h-8 px-2 sm:px-2.5 rounded-lg text-zinc-400 hover:text-white bg-[#16181d] hover:bg-[#1c1f24] border border-white/[0.08] transition-colors flex items-center gap-1.5 text-xs"
              title={`${t('nav.quickSearch')} (Ctrl + K)`}
            >
              <Search className="w-3.5 h-3.5" />
              <kbd className="hidden lg:inline text-[10px] font-mono px-1 py-0.2 bg-white/[0.06] rounded text-zinc-400">
                Ctrl K
              </kbd>
            </button>

            {/* Desktop Only Actions (>= md) */}
            <div className="hidden md:flex items-center gap-2">
              {/* Password Generator Button */}
              <button
                type="button"
                onClick={() => setIsGeneratorOpen(true)}
                className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white bg-[#16181d] hover:bg-[#1c1f24] border border-white/[0.08] flex items-center justify-center transition-colors"
                title={t('nav.generator')}
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>

              {/* Backup & Migration Button */}
              <button
                type="button"
                onClick={() => setIsBackupOpen(true)}
                className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white bg-[#16181d] hover:bg-[#1c1f24] border border-white/[0.08] flex items-center justify-center transition-colors"
                title={t('nav.backup')}
              >
                <FolderArchive className="w-3.5 h-3.5" />
              </button>

              {/* Security & Sessions Panel Button */}
              <button
                type="button"
                onClick={() => setIsSecurityOpen(true)}
                className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white bg-[#16181d] hover:bg-[#1c1f24] border border-white/[0.08] flex items-center justify-center transition-colors"
                title={t('nav.securityPanel')}
              >
                <Shield className="w-3.5 h-3.5 text-zinc-300" />
              </button>

              {/* PWA Installation Button */}
              {installPrompt && (
                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title={t('nav.installApp')}
                >
                  <Download className="w-3.5 h-3.5 text-zinc-300" />
                  <span>{t('nav.installApp')}</span>
                </button>
              )}

              {/* Setup Windows Hello if not yet configured */}
              {hasPasskeySupport && !userConfig?.wrapped_master_key && (
                <button
                  type="button"
                  onClick={handleSetupPasskey}
                  className="h-8 px-2.5 rounded-lg bg-[#16181d] hover:bg-[#1c1f24] border border-white/[0.08] text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title={t('nav.linkPin')}
                >
                  <Fingerprint className="w-3.5 h-3.5 text-zinc-300" />
                  <span>{t('nav.linkPin')}</span>
                </button>
              )}

              {/* Language Switcher Pill */}
              <LanguageSwitcher />
            </div>

            {/* Mobile "More Tools" Dropdown (< md) */}
            <div className="md:hidden">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg text-zinc-400 hover:text-white bg-[#16181d] hover:bg-[#1c1f24] border border-white/[0.08] flex items-center justify-center transition-colors"
                    title="Menú de herramientas"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="w-56 p-1.5 bg-[#0f1013] border border-white/[0.12] rounded-xl shadow-2xl z-50 text-xs text-zinc-200 focus:outline-none animate-scale-in"
                  >
                    <DropdownMenu.Item
                      onSelect={() => setIsGeneratorOpen(true)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.08] cursor-pointer outline-none transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-zinc-400" />
                      <span>{t('nav.generator')}</span>
                    </DropdownMenu.Item>

                    <DropdownMenu.Item
                      onSelect={() => setIsBackupOpen(true)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.08] cursor-pointer outline-none transition-colors"
                    >
                      <FolderArchive className="w-4 h-4 text-zinc-400" />
                      <span>{t('nav.backup')}</span>
                    </DropdownMenu.Item>

                    <DropdownMenu.Item
                      onSelect={() => setIsSecurityOpen(true)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.08] cursor-pointer outline-none transition-colors"
                    >
                      <Shield className="w-4 h-4 text-zinc-400" />
                      <span>{t('nav.securityPanel')}</span>
                    </DropdownMenu.Item>

                    {hasPasskeySupport && !userConfig?.wrapped_master_key && (
                      <DropdownMenu.Item
                        onSelect={handleSetupPasskey}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.08] cursor-pointer outline-none transition-colors text-blue-400"
                      >
                        <Fingerprint className="w-4 h-4" />
                        <span>{t('nav.linkPin')}</span>
                      </DropdownMenu.Item>
                    )}

                    {installPrompt && (
                      <DropdownMenu.Item
                        onSelect={handleInstallApp}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.08] cursor-pointer outline-none transition-colors text-emerald-400"
                      >
                        <Download className="w-4 h-4" />
                        <span>{t('nav.installApp')}</span>
                      </DropdownMenu.Item>
                    )}

                    <DropdownMenu.Item
                      onSelect={handleManualSync}
                      disabled={isManualSyncing}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.08] cursor-pointer outline-none transition-colors text-sky-400"
                    >
                      <RefreshCw className={`w-4 h-4 ${isManualSyncing ? 'animate-spin' : ''}`} />
                      <span>{isManualSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}</span>
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="h-px bg-white/[0.08] my-1" />

                    <div className="px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400 font-medium">Idioma</span>
                      <LanguageSwitcher />
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>

            {/* Manual Lock Button */}
            <button
              type="button"
              onClick={handleLockVault}
              className="h-8 w-8 rounded-lg text-zinc-400 hover:text-rose-400 bg-[#16181d] border border-white/[0.08] hover:border-rose-500/30 hover:bg-rose-500/10 flex items-center justify-center transition-colors"
              title={t('nav.lockVault')}
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 md:py-8 overflow-x-hidden">
        <VaultList
          items={items}
          onTogglePin={handleTogglePin}
          onDelete={handleDeleteAccount}
          onToggleRecoveryCode={handleToggleRecoveryCode}
          onOpenAddModal={() => setIsQrModalOpen(true)}
          onEditAccount={handleOpenEditAccount}
        />
      </main>

      {/* Minimalist Footer */}
      <footer className="w-full py-4 text-center border-t border-white/[0.06] text-zinc-500 text-[11px] font-mono">
        {t('auth.footerNotice')}
      </footer>

      {/* Floating Modals */}
      <QrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onSaveAccount={handleSaveNewAccount}
      />

      <EditAccountModal
        item={editingItem}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleUpdateAccount}
      />

      <PasswordGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
      />

      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        items={items}
        masterKey={masterKey}
        kdfSalt={userConfig?.kdf_salt || ''}
        onVaultRestored={handleVaultRestored}
      />

      {isSecurityOpen && userConfig && (
        <SecurityModal
          isOpen={isSecurityOpen}
          onClose={() => setIsSecurityOpen(false)}
          userId={userConfig.user_id}
          sessionToken={userConfig.session_token}
          userConfig={userConfig}
          masterKey={masterKey}
          onConfigUpdated={(cfg) => setUserConfig(cfg)}
          items={items}
          onOpenBackup={() => {
            setIsSecurityOpen(false);
            setIsBackupOpen(true);
          }}
          onSelectAccount={(account) => {
            setIsSecurityOpen(false);
            setEditingItem(account);
            setIsEditModalOpen(true);
          }}
        />
      )}

      <CommandPalette
        isOpen={isCmdPaletteOpen}
        onClose={() => setIsCmdPaletteOpen(false)}
        items={items}
        onOpenAddAccount={() => setIsQrModalOpen(true)}
        onOpenGenerator={() => setIsGeneratorOpen(true)}
        onTriggerSync={() => {
          if (masterKey) pushLocalVault('', masterKey);
        }}
        onLockVault={handleLockVault}
      />
    </div>
  );
}

export default App;
