import { useState, useEffect, useCallback, useTransition, useMemo, useRef } from 'react';
import {
  Shield,
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
} from 'lucide-react';
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
} from './lib/storage/idb.ts';
import { deriveMasterKey, generateSalt } from './lib/crypto/kdf.ts';
import { encryptVault, decryptVault } from './lib/crypto/vault.ts';
import {
  checkWebAuthnSupport,
  registerPlatformPasskey,
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
} from './lib/sync/syncEngine.ts';
import { AutoLockManager } from './lib/security/autoLock.ts';

import { VaultList } from './components/VaultList.tsx';
import { QrModal } from './components/QrModal.tsx';
import { PasswordGeneratorModal } from './components/PasswordGeneratorModal.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { BackupModal } from './components/BackupModal.tsx';

import type { VaultItem, LocalUserConfig, SyncStatus } from './types/vault.ts';
import type { ApiResponse } from './worker/types.ts';

type AppScreen = 'loading' | 'register' | 'locked' | 'unlocked';
type AuthMode = 'login' | 'register';

export function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [userConfig, setUserConfig] = useState<LocalUserConfig | null>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [vaultVersion, setVaultVersion] = useState<number>(1);
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>('synced');

  // Modales
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // Formularios de Autenticación
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

  // Referencia mutable a masterKey para listeners de red sin re-disparar efectos de inicialización
  const masterKeyRef = useRef<CryptoKey | null>(null);
  masterKeyRef.current = masterKey;

  const [, startTransition] = useTransition();

  // Escuchar evento de instalación PWA (beforeinstallprompt)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      toast.success('Revolt Pass instalado correctamente');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success('Instalando Revolt Pass en tu sistema operativo...');
    }
    setInstallPrompt(null);
  };

  // -------------------------------------------------------------------------
  // Cálculo de Entropía en Tiempo Real de la Contraseña Maestra
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
      return { bits, level: 1, label: 'Débil', color: 'text-rose-400' };
    } else if (bits < 60) {
      return { bits, level: 2, label: 'Media', color: 'text-amber-400' };
    } else if (bits < 80) {
      return { bits, level: 3, label: 'Segura', color: 'text-emerald-400' };
    } else {
      return { bits, level: 4, label: `Blindada • ${bits} bits`, color: 'text-emerald-300' };
    }
  }, [regPassword]);

  // -------------------------------------------------------------------------
  // 1. Inicialización de la Aplicación y Detección de Estado (Solo al montar)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      // 1. Comprobar soporte de WebAuthn en el dispositivo actual
      const webauthn = await checkWebAuthnSupport();
      if (isMounted) setHasPasskeySupport(webauthn.hasPlatformAuthenticator);

      // 2. Sincronizar deriva temporal con el servidor en segundo plano
      syncTimeWithServer().catch(() => {});

      // 3. Suscribirse a estados de sincronización y conectividad
      const unsubSync = onSyncStateChange((status) => {
        if (isMounted) setSyncStatusState(status);
      });

      const unsubNet = initNetworkSyncListeners(
        () => {
          toast.info('Conexión reestablecida. Sincronizando en segundo plano...');
          if (masterKeyRef.current) pushLocalVault('', masterKeyRef.current);
        },
        () => {
          toast.warning('Modo Offline: las modificaciones se guardarán localmente');
        }
      );

      // 4. Cargar perfil local desde IndexedDB
      try {
        const config = await getUserConfig();
        if (!config || !config.user_id) {
          if (isMounted) {
            setAuthMode('login');
            setScreen('register');
          }
        } else {
          if (isMounted) {
            setUserConfig(config);
            setScreen('locked');
          }
        }
      } catch {
        if (isMounted) {
          setAuthMode('login');
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
  // Auto-lock de Memoria por Inactividad (5 min) y Cambio de Visibilidad (30s)
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

  // Atajo universal Ctrl + K / Cmd + K
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

  // -------------------------------------------------------------------------
  // 2. Inicio de Sesión / Vinculación de Bóveda Existente (Multi-Dispositivo)
  // -------------------------------------------------------------------------
  const handleLoginExisting = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanUsername = loginUsername.trim().toLowerCase();
    if (!cleanUsername) {
      toast.error('Por favor ingresa tu nombre de usuario');
      return;
    }

    if (!loginPassword) {
      toast.error('Por favor ingresa tu Contraseña Maestra');
      return;
    }

    setIsAuthenticating(true);
    try {
      // 1. Obtener salt del usuario desde Cloudflare D1
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

      // 2. Derivar MasterKey con PBKDF2 600k rondas usando el salt remoto
      const saltBytes = Uint8Array.from(atob(kdf_salt), (c) => c.charCodeAt(0));
      const key = await deriveMasterKey(loginPassword, saltBytes, 600000);

      // 3. Descargar la bóveda cifrada desde Cloudflare D1
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

      // 4. Intentar descifrar la bóveda con la clave derivada (Zero-Knowledge verification)
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

      // 5. Guardar perfil y bóveda en IndexedDB local
      const config: LocalUserConfig = {
        user_id,
        username: cleanUsername,
        kdf_salt,
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

      setUserConfig(config);
      setMasterKey(key);
      setItems(decryptedItems);
      setVaultVersion(remoteVault.version);
      setLoginPassword('');
      setScreen('unlocked');

      toast.success('Bóveda vinculada y sincronizada', {
        description: `Se sincronizaron ${decryptedItems.length} credenciales desde tu cuenta en la nube.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión';
      toast.error(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 3. Registro Inicial de Usuario y Bóveda (Zero-Knowledge)
  // -------------------------------------------------------------------------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanUsername = regUsername.trim().toLowerCase();
    if (!cleanUsername) {
      toast.error('Por favor ingresa un nombre de usuario');
      return;
    }

    if (cleanUsername.length < 3) {
      toast.error('El nombre de usuario debe tener al menos 3 caracteres');
      return;
    }

    if (regPassword.length < 8) {
      toast.error('La Contraseña Maestra debe tener al menos 8 caracteres');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      toast.error('Las contraseñas maestras no coinciden');
      return;
    }

    setIsAuthenticating(true);
    try {
      // 1. Generar salt de 16 bytes y derivar MasterKey vía Web Worker (PBKDF2 600k)
      const salt = generateSalt(16);
      const saltBase64 = btoa(String.fromCharCode(...salt));
      const key = await deriveMasterKey(regPassword, salt, 600000);

      // 2. Cifrar bóveda inicial vacía
      const initialEnc = await encryptVault([], key, 1);

      // 3. Registrar usuario en Cloudflare D1
      let userId = `usr_${crypto.randomUUID()}`;
      try {
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

        const resJson = (await res.json()) as ApiResponse<{ user_id: string }>;
        if (resJson.data?.user_id) userId = resJson.data.user_id;
      } catch (e) {
        if (e instanceof Error && e.message.includes('ya existe')) {
          throw e;
        }
        // Modo offline: se guardará localmente con sync_status dirty
      }

      // 4. Guardar configuración y bóveda inicial en IndexedDB
      const config: LocalUserConfig = {
        user_id: userId,
        username: cleanUsername,
        kdf_salt: saltBase64,
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

      toast.success('Bóveda creada exitosamente', {
        description: 'Tu clave fue derivada con 600.000 rondas de PBKDF2 en un hilo aislado.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar la bóveda';
      toast.error(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 3. Desbloqueo de Bóveda con Master Password
  // -------------------------------------------------------------------------
  const handleUnlockWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userConfig || !unlockPassword) return;

    setIsAuthenticating(true);
    try {
      // 1. Derivar clave maestra a partir del salt almacenado
      const saltBytes = Uint8Array.from(atob(userConfig.kdf_salt), (c) => c.charCodeAt(0));
      const key = await deriveMasterKey(unlockPassword, saltBytes, 600000);

      // 2. Obtener bóveda local de IndexedDB
      const localVault = await getLocalVault();
      if (!localVault) {
        throw new Error('No se encontró ninguna bóveda local almacenada.');
      }

      // 3. Descifrar la bóveda con AES-GCM-256
      const decryptedItems = await decryptVault(
        localVault.encrypted_blob,
        localVault.iv,
        key
      );

      setMasterKey(key);
      setItems(decryptedItems);
      setVaultVersion(localVault.version);
      setUnlockPassword('');
      setScreen('unlocked');

      toast.success('Bóveda desbloqueada correctamente');

      // 4. Intentar sincronización remota en segundo plano
      pullRemoteVault().catch(() => {});
    } catch (err: unknown) {
      toast.error('Contraseña Maestra incorrecta o bóveda corrupta');
      console.error(err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 4. Desbloqueo Rápido con Windows Hello / Biometría WebAuthn
  // -------------------------------------------------------------------------
  const handleUnlockWithPasskey = async () => {
    if (!userConfig?.wrapped_master_key || !userConfig.webauthn_credential_id) {
      toast.error('Windows Hello no está configurado para esta bóveda.');
      return;
    }

    setIsAuthenticating(true);
    try {
      // Desempaquetar la clave maestra protegida por la clave de plataforma
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

      setMasterKey(key);
      setItems(decryptedItems);
      setVaultVersion(localVault.version);
      setScreen('unlocked');

      toast.success('Desbloqueado con Windows Hello');
      pullRemoteVault().catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en la verificación biométrica';
      toast.error(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 5. Vincular PIN de Windows Hello o Biometría
  // -------------------------------------------------------------------------
  const handleSetupPasskey = async () => {
    if (!masterKey || !userConfig) return;

    try {
      toast.info('Solicitando credencial de Windows Hello...');
      const reg = await registerPlatformPasskey(userConfig.user_id, userConfig.username);
      const wrappedPkg = await wrapMasterKey(masterKey, reg.credentialId);

      const updatedConfig: LocalUserConfig = {
        ...userConfig,
        webauthn_credential_id: reg.credentialId,
        wrapped_master_key: JSON.stringify(wrappedPkg),
      };

      await saveUserConfig(updatedConfig);
      setUserConfig(updatedConfig);

      toast.success('Windows Hello vinculado exitosamente', {
        description: 'Ahora puedes desbloquear tu bóveda al instante con tu PIN o huella digital.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al vincular passkey';
      toast.error(msg);
    }
  };

  // -------------------------------------------------------------------------
  // 6. Bloqueo Manual de Bóveda (Purga Estricta de RAM)
  // -------------------------------------------------------------------------
  const handleLockVault = useCallback(() => {
    setMasterKey(null);
    setScreen('locked');
    toast.info('Bóveda bloqueada. Claves purgadas de memoria RAM.');
  }, []);

  // -------------------------------------------------------------------------
  // 7. Persistencia y Actualización de Cuentas
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

      // Disparar sincronización asíncrona hacia Cloudflare D1
      pushLocalVault(userConfig.user_id, masterKey).catch(() => {});
    } catch (err: unknown) {
      console.error('Error al persistir cambios de la bóveda:', err);
      toast.error('Error al cifrar y guardar los cambios');
    }
  };

  const handleSaveNewAccount = async (newItem: VaultItem) => {
    startTransition(async () => {
      const updated = [newItem, ...items];
      await persistVaultChanges(updated);
      toast.success(`Cuenta de ${newItem.issuer} guardada y cifrada`);
    });
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
      toast.info('Cuenta eliminada de la bóveda');
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
  // 8. Restauración de Bóveda desde BackupModal
  // -------------------------------------------------------------------------
  const handleVaultRestored = async (newItems: VaultItem[]) => {
    await persistVaultChanges(newItems);
  };

  // -------------------------------------------------------------------------
  // RENDER: PANTALLA DE CARGA INICIAL
  // -------------------------------------------------------------------------
  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-[#090a0f] flex flex-col items-center justify-center p-6 text-zinc-100 relative overflow-hidden">
        {/* Malla técnica con máscara radial */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%)',
          }}
        />
        <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/10 shadow-inner flex items-center justify-center mb-4 text-zinc-100 animate-pulse">
          <Shield className="w-6 h-6 text-zinc-100" />
        </div>
        <p className="text-xs text-zinc-400 font-mono tracking-wider">
          Inicializando entorno seguro...
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: PANTALLA DE ACCESO / REGISTRO INICIAL (DISEÑO ANTI-AI CLICHÉS)
  // -------------------------------------------------------------------------
  if (screen === 'register') {
    const isConfirmMatch =
      regPassword.length > 0 && regConfirmPassword.length > 0 && regPassword === regConfirmPassword;

    return (
      <div className="min-h-screen bg-[#090a0f] flex flex-col items-center justify-center p-6 text-zinc-100 selection:bg-white/20 selection:text-white relative overflow-hidden">
        <Toaster position="bottom-right" richColors theme="dark" />

        {/* 1. Malla técnica con máscara radial */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%)',
          }}
        />

        {/* 2. Spotlight superior tenue */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-indigo-500/10 via-violet-500/5 to-transparent blur-3xl pointer-events-none" />

        {/* 3. La Bóveda (Card Craftsmanship) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="relative w-full max-w-md bg-zinc-900/60 backdrop-blur-2xl border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_68px_rgba(0,0,0,0.8)] rounded-2xl p-8 overflow-hidden z-10"
        >
          {/* Hairline highlight superior */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="flex flex-col items-center text-center">
            {/* Botón Volver a la Bóveda si ya existe perfil local */}
            {userConfig && (
              <div className="w-full flex justify-start mb-2">
                <button
                  type="button"
                  onClick={() => setScreen('locked')}
                  className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5 transition-colors py-1 px-2 rounded-lg hover:bg-white/[0.04]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver a mi bóveda ({userConfig.username})</span>
                </button>
              </div>
            )}

            {/* Emblema Mecanizado */}
            <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/10 shadow-inner flex items-center justify-center mb-3 text-zinc-100">
              <Shield className="w-6 h-6 text-zinc-100" />
            </div>

            {/* Micro-badge Superior */}
            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-zinc-400 bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-full mb-2">
              ZERO-KNOWLEDGE VAULT • CLIENT-SIDE ONLY
            </div>

            {/* Título & Subtítulo */}
            <h1 className="text-2xl font-bold tracking-tight text-white font-sans mb-1.5">
              Revolt Pass
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-sm mx-auto mb-5">
              {authMode === 'login'
                ? 'Ingresa tu usuario y Contraseña Maestra para descargar y descifrar tu bóveda en este dispositivo.'
                : 'Configura tu bóveda personal Zero-Knowledge. Tu Contraseña Maestra nunca saldrá de este dispositivo.'}
            </p>

            {/* Selector de Modo: Iniciar Sesión vs Crear Bóveda */}
            <div className="w-full grid grid-cols-2 p-1 bg-zinc-950/80 border border-white/[0.08] rounded-xl mb-5">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  authMode === 'login'
                    ? 'bg-zinc-800 text-white shadow-sm border border-white/10'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Iniciar Sesión</span>
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  authMode === 'register'
                    ? 'bg-zinc-800 text-white shadow-sm border border-white/10'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Crear Bóveda</span>
              </button>
            </div>

            {/* FORMULARIO 1: INICIAR SESIÓN (VINCULAR CUENTA EXISTENTE) */}
            {authMode === 'login' && (
              <form onSubmit={handleLoginExisting} className="w-full space-y-4 text-left">
                {/* Campo Nombre de Usuario */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
                    Nombre de Usuario
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="ej. rojas, admin, personal"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg text-sm px-3.5 py-2.5 pl-10 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Campo Contraseña Maestra */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
                    Contraseña Maestra (Master Password)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      placeholder="Tu contraseña maestra"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg text-sm px-3.5 py-2.5 pl-10 pr-10 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Botón CTA Iniciar Sesión */}
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full mt-3 bg-white text-zinc-950 font-semibold hover:bg-zinc-200 active:scale-[0.99] transition-all rounded-lg py-2.5 px-4 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                      <span>Sincronizando y Descifrando...</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4 text-zinc-950" />
                      <span>Descargar y Desbloquear Bóveda</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <span className="text-xs text-zinc-500">
                    ¿No tienes una cuenta aún?{' '}
                    <button
                      type="button"
                      onClick={() => setAuthMode('register')}
                      className="text-zinc-300 hover:text-white underline underline-offset-4"
                    >
                      Crea tu bóveda aquí
                    </button>
                  </span>
                </div>
              </form>
            )}

            {/* FORMULARIO 2: REGISTRO NUEVA BÓVEDA */}
            {authMode === 'register' && (
              <form onSubmit={handleRegister} className="w-full space-y-4 text-left">
                {/* Campo Nombre de Usuario */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
                    Nombre de Usuario
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="ej. rojas, admin, personal"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg text-sm px-3.5 py-2.5 pl-10 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Campo Contraseña Maestra */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
                    Contraseña Maestra (Master Password)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      placeholder="Mínimo 8 caracteres de alta entropía"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg text-sm px-3.5 py-2.5 pl-10 pr-10 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Medidor de Entropía en Tiempo Real de 4 Bloques */}
                  {regPassword.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-zinc-500">Fuerza de la clave</span>
                        <span className={passwordEntropy.color}>{passwordEntropy.label}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 h-1">
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
                                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                : 'bg-zinc-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Campo Confirmar Contraseña Maestra */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
                    Confirmar Contraseña Maestra
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Repite tu contraseña maestra"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg text-sm px-3.5 py-2.5 pl-10 pr-16 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
                      {isConfirmMatch && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {showRegConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Botón CTA Registro */}
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full mt-3 bg-white text-zinc-950 font-semibold hover:bg-zinc-200 active:scale-[0.99] transition-all rounded-lg py-2.5 px-4 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                      <span>Derivando Claves (PBKDF2 600k)...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-zinc-950" />
                      <span>Crear Bóveda Segura</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <span className="text-xs text-zinc-500">
                    ¿Ya tienes una bóveda creada?{' '}
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="text-zinc-300 hover:text-white underline underline-offset-4"
                    >
                      Inicia sesión aquí
                    </button>
                  </span>
                </div>
              </form>
            )}

            {/* Trust Badges en el Pie de Tarjeta */}
            <div className="w-full mt-6 pt-5 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                AES-GCM-256
              </span>
              <span>PBKDF2 600K ROUNDS</span>
              <span>WEBAUTHN READY</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: PANTALLA DE DESBLOQUEO (LOCK SCREEN)
  // -------------------------------------------------------------------------
  if (screen === 'locked') {
    const hasFastUnlock = !!userConfig?.wrapped_master_key;

    return (
      <div className="min-h-screen bg-[#090a0f] flex flex-col items-center justify-center p-6 text-zinc-100 selection:bg-white/20 selection:text-white relative overflow-hidden">
        <Toaster position="bottom-right" richColors theme="dark" />

        {/* Malla técnica con máscara radial */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 80%)',
          }}
        />

        {/* Spotlight superior */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-indigo-500/10 via-violet-500/5 to-transparent blur-3xl pointer-events-none" />

        {/* Tarjeta de Desbloqueo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="relative w-full max-w-sm bg-zinc-900/60 backdrop-blur-2xl border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_68px_rgba(0,0,0,0.8)] rounded-2xl p-8 overflow-hidden z-10"
        >
          {/* Hairline highlight */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="flex flex-col items-center text-center">
            {/* Emblema Mecanizado */}
            <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/10 shadow-inner flex items-center justify-center mb-3 text-zinc-100">
              <Lock className="w-6 h-6 text-zinc-100" />
            </div>

            {/* Micro-badge */}
            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-zinc-400 bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-full mb-2">
              SESSION LOCKED • RAM PURGED
            </div>

            <h1 className="text-xl font-bold text-white mb-1">Revolt Pass</h1>
            <p className="text-xs text-zinc-400 mb-6 font-mono">
              Usuario: <strong className="text-zinc-200">{userConfig?.username}</strong>
            </p>

            {/* Opción 1: Desbloqueo Rápido con Windows Hello / PIN */}
            {hasFastUnlock && (
              <div className="w-full mb-5">
                <button
                  type="button"
                  onClick={handleUnlockWithPasskey}
                  disabled={isAuthenticating}
                  className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-white font-semibold text-xs border border-white/10 shadow-sm flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Fingerprint className="w-4 h-4 text-zinc-300" />
                  <span>Desbloquear con Windows Hello / PIN</span>
                </button>

                <div className="flex items-center my-4 text-xs text-zinc-600">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="px-3 font-mono text-[11px] text-zinc-500">o contraseña maestra</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
              </div>
            )}

            {/* Opción 2: Desbloqueo con Master Password */}
            <form onSubmit={handleUnlockWithPassword} className="w-full space-y-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showUnlockPassword ? 'text' : 'password'}
                  required
                  placeholder="Contraseña Maestra..."
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  className="w-full bg-zinc-950/60 border border-white/[0.08] text-zinc-100 placeholder:text-zinc-600 rounded-lg text-sm px-3.5 py-2.5 pl-10 pr-10 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowUnlockPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showUnlockPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-2.5 px-4 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.2)] disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 text-zinc-950" />
                    <span>Desbloquear Bóveda</span>
                  </>
                )}
              </button>
            </form>

            {/* Opción para cambiar de cuenta o vincular otro usuario */}
            <div className="w-full mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setScreen('register');
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline-offset-4 hover:underline inline-flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span>Iniciar sesión con otra cuenta</span>
              </button>
            </div>

            {/* Trust Badges en el Pie */}
            <div className="w-full mt-6 pt-5 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                AES-GCM-256
              </span>
              <span>ZERO-KNOWLEDGE</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: PANTALLA PRINCIPAL (BÓVEDA DESBLOQUEADA)
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col selection:bg-white/20 selection:text-white relative">
      <Toaster position="bottom-right" richColors theme="dark" />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo y Branding */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-white/10 shadow-inner flex items-center justify-center text-zinc-100">
              <Shield className="w-5 h-5 text-zinc-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm md:text-base text-white tracking-tight">
                  Revolt Pass
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-white/[0.08] text-zinc-400">
                  v1.0
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 hidden sm:block">
                pass.revoltgroup.com.ar · Zero-Knowledge
              </p>
            </div>
          </div>

          {/* Acciones Superiores y Estado de Sincronización */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Pill de Sincronización */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
                syncStatus === 'synced'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : syncStatus === 'syncing' || syncStatus === 'dirty'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
              title={`Estado de sincronización: ${syncStatus}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  syncStatus === 'synced'
                    ? 'bg-emerald-500'
                    : syncStatus === 'syncing' || syncStatus === 'dirty'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-500'
                }`}
              />
              <span className="hidden md:inline capitalize text-[11px] font-sans">
                {syncStatus === 'synced'
                  ? 'Sincronizado'
                  : syncStatus === 'syncing'
                  ? 'Sincronizando'
                  : syncStatus === 'dirty'
                  ? 'Cambios locales'
                  : 'Offline / Error'}
              </span>
            </div>

            {/* Botón Command Palette */}
            <button
              type="button"
              onClick={() => setIsCmdPaletteOpen(true)}
              className="p-2 rounded-xl text-zinc-400 hover:text-white bg-zinc-900 border border-white/[0.08] hover:border-zinc-700 transition-colors flex items-center gap-1.5 text-xs"
              title="Buscar (Ctrl + K)"
            >
              <Search className="w-4 h-4" />
              <kbd className="hidden lg:inline text-[10px] font-mono px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">
                Ctrl K
              </kbd>
            </button>

            {/* Botón Generador de Contraseñas */}
            <button
              type="button"
              onClick={() => setIsGeneratorOpen(true)}
              className="p-2 rounded-xl text-zinc-400 hover:text-white bg-zinc-900 border border-white/[0.08] hover:border-zinc-700 transition-colors"
              title="Generador de Contraseñas"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            {/* Botón Respaldo & Migración */}
            <button
              type="button"
              onClick={() => setIsBackupOpen(true)}
              className="p-2 rounded-xl text-zinc-400 hover:text-white bg-zinc-900 border border-white/[0.08] hover:border-zinc-700 transition-colors"
              title="Respaldo & Migración (Copia Cifrada / Texto Plano)"
            >
              <FolderArchive className="w-4 h-4" />
            </button>

            {/* Botón de Instalación PWA */}
            {installPrompt && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-600/15 border border-indigo-500/30 hover:bg-indigo-600/25 text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Instalar Revolt Pass en tu sistema operativo (PWA)"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Instalar App</span>
              </button>
            )}

            {/* Configurar Windows Hello si aún no está vinculado */}
            {hasPasskeySupport && !userConfig?.wrapped_master_key && (
              <button
                type="button"
                onClick={handleSetupPasskey}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 border border-white/10 hover:bg-zinc-750 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Habilitar PIN de Windows Hello o Biometría"
              >
                <Fingerprint className="w-4 h-4 text-zinc-300" />
                <span className="hidden sm:inline">Vincular PIN</span>
              </button>
            )}

            {/* Botón de Bloqueo Manual */}
            <button
              type="button"
              onClick={handleLockVault}
              className="p-2 rounded-xl text-zinc-400 hover:text-rose-300 bg-zinc-900 border border-white/[0.08] hover:border-rose-900/50 hover:bg-rose-950/30 transition-colors"
              title="Bloquear Bóveda (Purgar memoria RAM)"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        <VaultList
          items={items}
          onTogglePin={handleTogglePin}
          onDelete={handleDeleteAccount}
          onToggleRecoveryCode={handleToggleRecoveryCode}
          onOpenAddModal={() => setIsQrModalOpen(true)}
        />
      </main>

      {/* Footer Minimalista */}
      <footer className="w-full py-4 text-center border-t border-white/[0.04] text-zinc-500 text-[11px] font-mono">
        Revolt Pass · Zero-Knowledge AES-GCM 256 · Cloudflare Edge & D1
      </footer>

      {/* Modales Flotantes */}
      <QrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onSaveAccount={handleSaveNewAccount}
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
