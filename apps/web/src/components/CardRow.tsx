'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

interface CardRowProps {
  children: React.ReactNode;
  className?: string;
}

export function CardRow({ children, className }: CardRowProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn('flex flex-wrap items-end gap-3 sm:gap-4', className)}
    >
      {children}
    </motion.div>
  );
}
