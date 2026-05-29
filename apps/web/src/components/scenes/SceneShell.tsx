'use client';

import { motion, type Variants } from 'framer-motion';

const variants: Variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function SceneShell({
  sceneKey,
  children,
}: {
  sceneKey: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key={sceneKey}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}
