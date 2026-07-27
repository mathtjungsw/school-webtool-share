import { motion } from 'framer-motion'
import { Construction } from 'lucide-react'

interface ComingSoonProps {
  title: string
  desc: string
  icon?: string
}

export default function ComingSoon({ title, desc, icon = '🚧' }: ComingSoonProps) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-sm w-full text-center"
      >
        {/* Decorative bg blob */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-violet-500/10 blur-2xl" />
          </div>
          <div className="relative flex items-center justify-center w-20 h-20 mx-auto rounded-3xl bg-surface-800 border border-white/10 shadow-xl text-4xl">
            {icon}
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm">
          <Construction size={14} />
          <span>개발 중입니다</span>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-1 rounded-full overflow-hidden bg-surface-800">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-500 to-sky-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: i === 1 ? '100%' : i === 2 ? '40%' : '10%' }}
                transition={{ delay: i * 0.2, duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-2">개발 진행률</p>
      </motion.div>
    </div>
  )
}
