import { Shield, KeyRound, Lock, Smartphone } from 'lucide-react'

export function App() {
  return (
    <div className="min-h-screen bg-[#090a0f] text-gray-100 flex flex-col items-center justify-center p-6 selection:bg-purple-500/30 selection:text-purple-200">
      <div className="max-w-md w-full bg-[#12131a] border border-gray-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 mb-5">
            <Shield className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            Revolt Pass
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            Zero-Knowledge 2FA & Security Vault
          </p>

          <div className="w-full grid grid-cols-3 gap-2 py-4 border-y border-gray-800/60 mb-6 text-xs text-gray-400">
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-900/50">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>AES-256</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-900/50">
              <KeyRound className="w-4 h-4 text-purple-400" />
              <span>RFC 6238</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-900/50">
              <Smartphone className="w-4 h-4 text-blue-400" />
              <span>WebAuthn</span>
            </div>
          </div>

          <div className="w-full flex items-center justify-between text-xs text-gray-500 font-mono px-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Fase 1: Setup & Scaffolding
            </span>
            <span>v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
