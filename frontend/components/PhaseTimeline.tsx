"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PhaseLog } from "@/hooks/useAnalysis";

type Props = { phases: PhaseLog[]; currentPhase: string | null };

export default function PhaseTimeline({ phases, currentPhase }: Props) {
  if (phases.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {phases.map((p, i) => (
          <motion.div
            key={`${p.phase}-${i}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3"
          >
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
              {p.done ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-5 h-5 rounded-full bg-black flex items-center justify-center"
                >
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              ) : (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-black"
                />
              )}
            </div>
            <span className={`text-sm ${p.done ? "text-gray-400 line-through" : "text-gray-800 font-medium"}`}>
              {p.message}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
