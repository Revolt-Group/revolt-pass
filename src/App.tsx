import { useState, useEffect, useCallback, useTransition } from 'react';
import {
  Shield,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Toaster, toast } from 'sonner';

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
} from './lib/crypto/webauthn.ts';
import { syncTimeWithServer } from './lib/sync/timeSync.ts';
import {
  pullRemoteVault,
  pushLocalVault,
  onSyncStateChange,
  initNetworkSyncListeners,
} from './lib/sync/syncEngine.ts';

import { VaultList } from './components/VaultList.tsx';
import { QrModal } from './components/QrModal.tsx';
import { PasswordGeneratorModal } from './components/PasswordGeneratorModal.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';

import type { VaultItem, LocalUserConfig, SyncStatus } from './types/vault.ts';
import type { ApiResponse } from './worker/types.ts';

type AppScreen = 'loading' | 'register' | 'locked' | 'unlocked';

export function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [userConfig, setUserConfig] = useState<LocalUserConfig | null>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [vaultVersion, setVaultVersion] = useState<number>(1);
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>('synced');

  // Modales
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);

  // Formularios de Autenticación
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [hasPasskeySupport, setHasPasskeySupport] = useState(false);

  const [, startTransition] = useTransition();

  // -------------------------------------------------------------------------
  // 1. Inicialización de la Aplicación y Detección de Estado
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
          if (masterKey) pushLocalVault('', masterKey);
        },
        () => {
          toast.warning('Modo Offline: las modificaciones se guardarán localmente');
        }
      );

      // 4. Cargar perfil local desde IndexedDB
      try {
        const config = await getUserConfig();
        if (!config || !config.user_id) {
          if (isMounted) setScreen('register');
        } else {
          if (isMounted) {
            setUserConfig(config);
            setScreen('locked');
          }
        }
      } catch {
        if (isMounted) setScreen('register');
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
  }, [masterKey]);

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
  // 2. Registro Inicial de Usuario y Bóveda (Zero-Knowledge)
  // -------------------------------------------------------------------------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regUsername.trim()) {
      toast.error('Por favor ingresa un nombre de usuario');
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
            username: regUsername.trim(),
            kdf_salt: saltBase64,
            encrypted_blob: initialEnc.encryptedBlob,
            iv: initialEnc.iv,
          }),
        });

        if (res.ok) {
          const resJson = (await res.json()) as ApiResponse<{ user_id: string }>;
          if (resJson.data?.user_id) userId = resJson.data.user_id;
        }
      } catch {
        // Modo offline: se guardará localmente con sync_status dirty
      }

      // 4. Guardar configuración y bóveda inicial en IndexedDB
      const config: LocalUserConfig = {
        user_id: userId,
        username: regUsername.trim(),
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
      toast.success('¡Bóveda creada exitosamente!');
    } catch (err) {
      toast.error('Error al inicializar la bóveda criptográfica');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 3. Desbloqueo Frío con Contraseña Maestra
  // -------------------------------------------------------------------------
  const handleUnlockWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userConfig || !unlockPassword) return;

    setIsAuthenticating(true);
    try {
      // 1. Reconstruir salt
      const saltBytes = Uint8Array.from(atob(userConfig.kdf_salt), (c) => c.charCodeAt(0));

      // 2. Derivar MasterKey con Web Worker (PBKDF2-SHA256 600k rondas)
      const key = await deriveMasterKey(unlockPassword, saltBytes, 600000);

      // 3. Cargar y descifrar bóveda desde IndexedDB
      const localVault = await getLocalVault();
      if (!localVault) {
        throw new Error('No se encontró la bóveda local');
      }

      const decryptedItems = await decryptVault(localVault.encrypted_blob, localVault.iv, key);

      setMasterKey(key);
      setItems(decryptedItems);
      setVaultVersion(localVault.version);
      setScreen('unlocked');
      setUnlockPassword('');
      toast.success('Bóveda descifrada');

      // Intentar pull de cambios remotos en segundo plano
      pullRemoteVault().catch(() => {});
    } catch {
      toast.error('Contraseña Maestra incorrecta o datos alterados');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 4. Desbloqueo Rápido con Windows Hello (PIN) / Biometría
  // -------------------------------------------------------------------------
  const handleUnlockWithPasskey = async () => {
    if (!userConfig || !userConfig.wrapped_master_key || !userConfig.webauthn_credential_id) {
      toast.error('Windows Hello / Biometría aún no está configurado en este dispositivo.');
      return;
    }

    setIsAuthenticating(true);
    try {
      const wrappedPackage = JSON.parse(userConfig.wrapped_master_key);
      // Invocar Windows Hello (solicitará PIN en PC o huella en móvil)
      const key = await unwrapMasterKey(wrappedPackage, userConfig.webauthn_credential_id);

      const localVault = await getLocalVault();
      if (!localVault) throw new Error('Bóveda no encontrada');

      const decryptedItems = await decryptVault(localVault.encrypted_blob, localVault.iv, key);

      setMasterKey(key);
      setItems(decryptedItems);
      setVaultVersion(localVault.version);
      setScreen('unlocked');
      toast.success('Desbloqueado con Windows Hello');

      pullRemoteVault().catch(() => {});
    } catch (err) {
      toast.error('Verificación biométrica / PIN cancelada o rechazada.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 5. Enrolamiento de Windows Hello / Biometría
  // -------------------------------------------------------------------------
  const handleSetupPasskey = async () => {
    if (!masterKey || !userConfig) return;

    try {
      toast.info('Solicitando verificación a Windows Hello...');
      const cred = await registerPlatformPasskey(userConfig.user_id, userConfig.username);

      // Envolver la MasterKey con la credencial de hardware
      const wrappedPackage = await wrapMasterKey(masterKey, cred.rawId);

      const updatedConfig: LocalUserConfig = {
        ...userConfig,
        webauthn_credential_id: cred.rawId,
        wrapped_master_key: JSON.stringify(wrappedPackage),
      };

      await saveUserConfig(updatedConfig);
      setUserConfig(updatedConfig);
      toast.success('¡Windows Hello / Biometría configurado para Desbloqueo Rápido!');
    } catch (err) {
      toast.error('No se pudo vincular Windows Hello en este dispositivo');
    }
  };

  // -------------------------------------------------------------------------
  // 6. Bloqueo Manual Inmediato (Higiene de RAM)
  // -------------------------------------------------------------------------
  const handleLockVault = useCallback(() => {
    setMasterKey(null);
    setItems([]);
    setScreen('locked');
    toast.info('Bóveda bloqueada: memoria RAM purgada');
  }, []);

  // -------------------------------------------------------------------------
  // 7. Mutaciones de Cuentas (Agregar, Fijar, Alternar Recovery, Eliminar)
  // -------------------------------------------------------------------------
  const persistVaultChanges = useCallback(
    async (updatedItems: VaultItem[]) => {
      if (!masterKey || !userConfig) return;

      const nextVersion = vaultVersion + 1;
      // 1. Cifrar con AES-GCM en memoria
      const enc = await encryptVault(updatedItems, masterKey, nextVersion);

      // 2. Persistir localmente en IndexedDB
      await saveLocalVault({
        user_id: userConfig.user_id,
        encrypted_blob: enc.encryptedBlob,
        iv: enc.iv,
        version: nextVersion,
        updated_at: enc.updatedAt,
        sync_status: 'dirty',
      });

      startTransition(() => {
        setItems(updatedItems);
        setVaultVersion(nextVersion);
      });

      // 3. Sincronizar en segundo plano con Cloudflare D1
      pushLocalVault('', masterKey).catch(() => {});
    },
    [masterKey, userConfig, vaultVersion]
  );

  const handleSaveNewAccount = async (newItem: VaultItem) => {
    const updated = [newItem, ...items];
    await persistVaultChanges(updated);
  };

  const handleTogglePin = (id: string) => {
    const updated = items.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i));
    persistVaultChanges(updated);
  };

  const handleDeleteAccount = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    persistVaultChanges(updated);
    toast.success('Cuenta eliminada de la bóveda');
  };

  const handleToggleRecoveryCode = (id: string, codeIndex: number) => {
    const updated = items.map((item) => {
      if (item.id !== id || !item.recovery_codes) return item;
      const codes = [...item.recovery_codes];
      codes[codeIndex] = { ...codes[codeIndex], used: !codes[codeIndex].used };
      return { ...item, recovery_codes: codes, updated_at: Date.now() };
    });
    persistVaultChanges(updated);
  };

  // -------------------------------------------------------------------------
  // RENDER: PANTALLA DE CARGA
  // -------------------------------------------------------------------------
  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100">
        <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center animate-pulse mb-4">
          <Shield className="w-6 h-6 text-violet-400" />
        </div>
        <p className="text-xs text-zinc-500 font-mono tracking-wider">
          Inicializando entorno seguro...
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: PANTALLA DE REGISTRO INICIAL
  // -------------------------------------------------------------------------
  if (screen === 'register') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 selection:bg-violet-500/30 selection:text-violet-200">
        <Toaster position="bottom-right" richColors theme="dark" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 shadow-2xl backdrop-blur-2xl relative overflow-hidden"
        >
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/25 mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white mb-1.5">
              Revolt Pass
            </h1>
            <p className="text-xs text-zinc-400 mb-6 max-w-xs">
              Configura tu bóveda personal Zero-Knowledge. Tu Contraseña Maestra nunca saldrá de este dispositivo.
            </p>

            <form onSubmit={handleRegister} className="w-full space-y-4 text-left">
              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">
                  Nombre de Usuario
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. rojas, admin, personal"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">
                  Contraseña Maestra (Master Password)
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 8 caracteres de alta entropía"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">
                  Confirmar Contraseña Maestra
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repite tu contraseña maestra"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full mt-2 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-xs shadow-xl shadow-violet-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Derivando Claves (PBKDF2 600k)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Crear Bóveda Segura</span>
                  </>
                )}
              </button>
            </form>
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
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 selection:bg-violet-500/30 selection:text-violet-200">
        <Toaster position="bottom-right" richColors theme="dark" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 shadow-2xl backdrop-blur-2xl relative overflow-hidden"
        >
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center mb-4 text-violet-400 shadow-lg">
              <Lock className="w-7 h-7" />
            </div>

            <h1 className="text-xl font-bold text-white mb-1">Revolt Pass</h1>
            <p className="text-xs text-zinc-400 mb-6 font-mono">
              Usuario: <strong className="text-zinc-200">{userConfig?.username}</strong>
            </p>

            {/* Opción 1: Desbloqueo Rápido con Windows Hello / Biometría */}
            {hasFastUnlock && (
              <div className="w-full mb-5">
                <button
                  type="button"
                  onClick={handleUnlockWithPasskey}
                  disabled={isAuthenticating}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-xl shadow-violet-600/30 flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Fingerprint className="w-4 h-4" />
                  <span>Desbloquear con Windows Hello / PIN</span>
                </button>

                <div className="flex items-center my-4 text-xs text-zinc-600">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="px-3">o contraseña maestra</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
              </div>
            )}

            {/* Opción 2: Desbloqueo con Master Password */}
            <form onSubmit={handleUnlockWithPassword} className="w-full space-y-3">
              <input
                type="password"
                required
                placeholder="Contraseña Maestra..."
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors text-center"
              />

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Desbloquear</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: PANTALLA PRINCIPAL (BÓVEDA DESBLOQUEADA)
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0a0a0d] text-zinc-100 flex flex-col selection:bg-violet-500/30 selection:text-violet-200">
      <Toaster position="bottom-right" richColors theme="dark" />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo y Branding */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-600/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm md:text-base text-white tracking-tight">
                  Revolt Pass
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
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
              className="p-2 rounded-xl text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex items-center gap-1.5 text-xs"
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
              className="p-2 rounded-xl text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-colors"
              title="Generador de Contraseñas"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            {/* Configurar Windows Hello si aún no está vinculado */}
            {hasPasskeySupport && !userConfig?.wrapped_master_key && (
              <button
                type="button"
                onClick={handleSetupPasskey}
                className="px-3 py-1.5 rounded-xl bg-violet-600/10 border border-violet-500/30 hover:bg-violet-600/20 text-violet-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Habilitar PIN de Windows Hello o Biometría"
              >
                <Fingerprint className="w-4 h-4" />
                <span className="hidden sm:inline">Vincular PIN</span>
              </button>
            )}

            {/* Botón de Bloqueo Manual */}
            <button
              type="button"
              onClick={handleLockVault}
              className="p-2 rounded-xl text-zinc-400 hover:text-rose-300 bg-zinc-900 border border-zinc-800/80 hover:border-rose-900/50 hover:bg-rose-950/30 transition-colors"
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
      <footer className="w-full py-4 text-center border-t border-zinc-900 text-zinc-600 text-[11px] font-mono">
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
