"use client";

import { memo } from "react";
import { motion } from "framer-motion";

type CloudTransitionSceneProps = {
  phase: "zoom" | "clouds" | "reveal";
};

const CLOUD_LAYERS = [
  {
    className: "left-[-18%] top-[-4%] h-[42vh] w-[52vw] blur-[34px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.84) 34%, rgba(255,255,255,0.24) 68%, rgba(255,255,255,0) 100%)",
    animate: {
      x: [0, 42, 96],
      y: [26, 2, -42],
      scale: [0.9, 1.04, 1.22],
      opacity: [0, 0.88, 0.12],
    },
    transition: { duration: 1.55, delay: 0.02 },
  },
  {
    className: "right-[-22%] top-[2%] h-[46vh] w-[58vw] blur-[40px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.8) 32%, rgba(255,255,255,0.22) 70%, rgba(255,255,255,0) 100%)",
    animate: {
      x: [0, -38, -92],
      y: [14, -6, -34],
      scale: [0.92, 1.06, 1.26],
      opacity: [0, 0.82, 0.08],
    },
    transition: { duration: 1.42, delay: 0.08 },
  },
  {
    className: "left-[4%] top-[24%] h-[30vh] w-[34vw] blur-[24px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.72) 36%, rgba(255,255,255,0.18) 72%, rgba(255,255,255,0) 100%)",
    animate: {
      x: [0, 26, 52],
      y: [18, -6, -24],
      scale: [0.96, 1.12, 1.28],
      opacity: [0, 0.76, 0.06],
    },
    transition: { duration: 1.1, delay: 0.12 },
  },
  {
    className: "right-[8%] top-[28%] h-[28vh] w-[30vw] blur-[22px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.68) 34%, rgba(255,255,255,0.16) 72%, rgba(255,255,255,0) 100%)",
    animate: {
      x: [0, -24, -44],
      y: [18, -4, -22],
      scale: [0.98, 1.12, 1.26],
      opacity: [0, 0.72, 0.04],
    },
    transition: { duration: 1.02, delay: 0.16 },
  },
  {
    className: "left-[-10%] bottom-[-8%] h-[46vh] w-[48vw] blur-[34px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.78) 36%, rgba(255,255,255,0.18) 72%, rgba(255,255,255,0) 100%)",
    animate: {
      x: [0, 32, 76],
      y: [42, 12, -18],
      scale: [0.92, 1.06, 1.22],
      opacity: [0, 0.84, 0.08],
    },
    transition: { duration: 1.36, delay: 0.1 },
  },
  {
    className: "right-[-14%] bottom-[-12%] h-[50vh] w-[54vw] blur-[38px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.82) 38%, rgba(255,255,255,0.18) 74%, rgba(255,255,255,0) 100%)",
    animate: {
      x: [0, -34, -84],
      y: [36, 8, -24],
      scale: [0.94, 1.08, 1.24],
      opacity: [0, 0.82, 0.08],
    },
    transition: { duration: 1.48, delay: 0.06 },
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
          filter: isReveal ? "blur(8px)" : "blur(0px)",
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
