'use client';

import { motion, useMotionValue, useSpring, useTransform, AnimatePresence, type MotionValue } from 'motion/react';
import { Children, cloneElement, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

interface DockItemData {
  icon: ReactElement;
  label: string;
  onClick?: () => void;
  className?: string;
  /** 0-1 progress value to show a circular progress ring. undefined = no ring */
  progress?: number;
}

interface DockItemProps {
  children: ReactElement | ReactElement[];
  className?: string;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: { mass: number; stiffness: number; damping: number };
  distance: number;
  magnification: number;
  baseItemSize: number;
  progress?: number;
}

function DockItem({ children, className = '', onClick, mouseX, spring, distance, magnification, baseItemSize, progress }: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, val => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize
    };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={onClick}
      className={`relative inline-flex items-center justify-center rounded-full bg-[#060010] border-neutral-700 border-2 shadow-md flex-shrink-0 ${className}`}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, child => cloneElement(child as ReactElement<{ isHovered?: MotionValue<number> }>, { isHovered }))}
      {progress !== undefined && <ProgressRing progress={progress} />}
    </motion.div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const r = 22;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      viewBox="0 0 50 50"
    >
      {/* Background track */}
      <circle
        cx="25"
        cy="25"
        r={r}
        fill="none"
        stroke="rgba(86, 198, 190, 0.2)"
        strokeWidth="3"
      />
      {/* Progress arc */}
      <circle
        cx="25"
        cy="25"
        r={r}
        fill="none"
        stroke="var(--lagoon, #56c6be)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  );
}

interface DockLabelProps {
  children: React.ReactNode;
  className?: string;
  isHovered?: MotionValue<number>;
}

function DockLabel({ children, className = '', isHovered }: DockLabelProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', latest => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`${className} absolute -top-6 left-1/2 w-fit whitespace-pre rounded-md border border-neutral-700 bg-[#060010] px-2 py-0.5 text-xs text-white`}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface DockIconProps {
  children: React.ReactNode;
  className?: string;
  isHovered?: MotionValue<number>;
}

function DockIcon({ children, className = '' }: DockIconProps) {
  return <div className={`flex items-center justify-center ${className}`}>{children}</div>;
}

interface DockProps {
  items: DockItemData[];
  className?: string;
  spring?: { mass: number; stiffness: number; damping: number };
  magnification?: number;
  distance?: number;
  panelHeight?: number;
  dockHeight?: number;
  baseItemSize?: number;
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 70,
  distance = 200,
  panelHeight = 64,
  dockHeight = 256,
  baseItemSize = 50
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [responsiveItemSize, setResponsiveItemSize] = useState(baseItemSize);

  // Shrink icons to fit within the screen width
  useEffect(() => {
    function calculateSize() {
      const screenWidth = window.innerWidth;
      const paddingAndGaps = 32 + (items.length - 1) * 16 + 4; // px-4 (32) + gaps (16 each) + border (4)
      const availableWidth = screenWidth - paddingAndGaps;
      const maxItemSize = Math.floor(availableWidth / items.length);
      setResponsiveItemSize(Math.min(baseItemSize, maxItemSize));
    }

    calculateSize();
    window.addEventListener('resize', calculateSize);
    return () => window.removeEventListener('resize', calculateSize);
  }, [items.length, baseItemSize]);

  const effectiveItemSize = responsiveItemSize;
  const effectiveMagnification = Math.min(magnification, effectiveItemSize * 1.4);

  const maxHeight = useMemo(
    () => Math.max(dockHeight, effectiveMagnification + effectiveMagnification / 2 + 4),
    [effectiveMagnification, dockHeight]
  );
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.div style={{ height, scrollbarWidth: 'none' }} className="mx-2 flex max-w-full items-center">
      <motion.div
        ref={containerRef}
        onMouseMove={({ pageX }) => {
          isHovered.set(1);
          mouseX.set(pageX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
        }}
        className={`${className} absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-end w-fit max-w-[calc(100vw-1rem)] gap-2 sm:gap-4 rounded-2xl border-neutral-700 border-2 pb-2 px-2 sm:px-4`}
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label="Application dock"
      >
        {items.map((item, index) => (
          <DockItem
            key={index}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={effectiveMagnification}
            baseItemSize={effectiveItemSize}
            progress={item.progress}
          >
            <DockIcon>{item.icon}</DockIcon>
            <DockLabel>{item.label}</DockLabel>
          </DockItem>
        ))}
      </motion.div>
    </motion.div>
  );
}
