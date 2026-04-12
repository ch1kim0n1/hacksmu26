"use client";

import { memo } from "react";
import { motion } from "framer-motion";

type CloudTransitionSceneProps = {
  phase: "zoom" | "clouds" | "reveal";
};

const CLOUD_LAYERS = [
  {
    className: "left-[-16%] top-[0%] h-[40vh] w-[50vw] blur-[32px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.84) 34%, rgba(255,255,255,0.24) 68%, rgba(255,255,255,0) 100%)",
    animate: {
      x: 84,
      y: -34,
      scale: 1.14,
      opacity: 0.78,
    },
    transition: { duration: 1.1, delay: 0.02 },
  },
  {
    className: "right-[-18%] top-[4%] h-[44vh] w-[54vw] blur-[36px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.8) 32%, rgba(255,255,255,0.22) 70%, rgba(255,255,255,0) 100%)",
    animate: {
      x: -78,
      y: -26,
      scale: 1.16,
      opacity: 0.74,
    },
    transition: { duration: 1.04, delay: 0.06 },
  },
  {
    className: "left-[6%] top-[26%] h-[28vh] w-[32vw] blur-[22px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.72) 36%, rgba(255,255,255,0.18) 72%, rgba(255,255,255,0) 100%)",
    animate: {
      x: 42,
      y: -18,
      scale: 1.18,
      opacity: 0.68,
    },
    transition: { duration: 0.92, delay: 0.12 },
  },
  {
    className: "right-[8%] top-[30%] h-[26vh] w-[28vw] blur-[20px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.68) 34%, rgba(255,255,255,0.16) 72%, rgba(255,255,255,0) 100%)",
    animate: {
      x: -36,
      y: -16,
      scale: 1.16,
      opacity: 0.64,
    },
    transition: { duration: 0.88, delay: 0.14 },
  },
  {
    className: "left-[-8%] bottom-[-6%] h-[42vh] w-[44vw] blur-[30px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.78) 36%, rgba(255,255,255,0.18) 72%, rgba(255,255,255,0) 100%)",
    animate: {
      x: 62,
      y: -24,
      scale: 1.14,
      opacity: 0.76,
    },
    transition: { duration: 1.08, delay: 0.08 },
  },
];

function CloudTransitionScene({ phase }: CloudTransitionSceneProps) {
  const isReveal = phase === "reveal";

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{
        opacity: isReveal ? 0 : 1,
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: isReveal ? 0.35 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(186,206,230,0.28)_0%,rgba(216,229,242,0.42)_36%,rgba(239,244,249,0.56)_100%)]"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{
          opacity: isReveal ? 0 : 1,
          scale: isReveal ? 1.03 : 1,
        }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.14)_28%,rgba(255,255,255,0.04)_54%,rgba(255,255,255,0)_100%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: isReveal ? 0 : 1 }}
        transition={{ duration: 0.28 }}
      />

      {CLOUD_LAYERS.map((layer, index) => (
        <motion.div
          key={index}
          className={`absolute ${layer.className}`}
          style={{ background: layer.background, willChange: "transform, opacity" }}
          initial={{ opacity: 0, scale: 0.88, x: 0, y: 0 }}
          animate={
            isReveal
              ? {
                  opacity: 0,
                  scale: 1.18,
                  x: Array.isArray(layer.animate.x) ? layer.animate.x[2] : 0,
                  y: Array.isArray(layer.animate.y) ? layer.animate.y[2] : 0,
                }
              : layer.animate
          }
          transition={{
            duration: layer.transition.duration,
            delay: layer.transition.delay,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.08)_24%,rgba(255,255,255,0)_58%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: isReveal ? 0 : 1 }}
        transition={{ duration: 0.24 }}
      />
    </motion.div>
  );
}

export default memo(CloudTransitionScene);
