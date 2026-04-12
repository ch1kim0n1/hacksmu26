"use client";

import { motion } from "framer-motion";

type CloudTransitionSceneProps = {
  active: boolean;
  reveal: boolean;
};

// Each cloud: left offset, width, height, animation duration, delay
const CLOUDS = [
  { left: "-5%",  w: "58vw", h: "26vh", dur: 1.35, delay: 0     },
  { left: "42%",  w: "50vw", h: "22vh", dur: 1.50, delay: -0.42 },
  { left: "-18%", w: "44vw", h: "20vh", dur: 1.18, delay: -0.68 },
  { left: "24%",  w: "54vw", h: "24vh", dur: 1.40, delay: -0.55 },
  { left: "-2%",  w: "62vw", h: "30vh", dur: 1.65, delay: -0.28 },
  { left: "14%",  w: "38vw", h: "18vh", dur: 1.08, delay: -0.78 },
  { left: "54%",  w: "46vw", h: "21vh", dur: 1.25, delay: -0.18 },
  { left: "-24%", w: "64vw", h: "32vh", dur: 1.72, delay: -0.48 },
];

// A cloud built from overlapping white ellipses — clearly visible, no blur
function CloudShape() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Base body */}
      <div style={{ position: "absolute", left: "8%",  bottom: "2%",  width: "84%", height: "50%", background: "white", borderRadius: "50%", opacity: 0.98 }} />
      {/* Left puff */}
      <div style={{ position: "absolute", left: "4%",  bottom: "22%", width: "40%", height: "68%", background: "white", borderRadius: "50%", opacity: 0.97 }} />
      {/* Center-left top puff */}
      <div style={{ position: "absolute", left: "22%", bottom: "32%", width: "48%", height: "80%", background: "white", borderRadius: "50%", opacity: 0.98 }} />
      {/* Center-right puff */}
      <div style={{ position: "absolute", left: "44%", bottom: "28%", width: "36%", height: "70%", background: "white", borderRadius: "50%", opacity: 0.96 }} />
      {/* Right puff */}
      <div style={{ position: "absolute", left: "60%", bottom: "18%", width: "34%", height: "56%", background: "white", borderRadius: "50%", opacity: 0.95 }} />
    </div>
  );
}

export default function CloudTransitionScene({ active, reveal }: CloudTransitionSceneProps) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: active ? 0.22 : 0.55, ease: "easeOut" }}
      aria-hidden="true"
    >
      {/* Clear blue sky — strong contrast for white clouds */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#1a5fa8_0%,#3b87cc_35%,#7ab8e8_70%,#c4dff5_100%)]" />

      {/* Scrolling speed-streak lines */}
      <div
        className="absolute left-0 right-0 animate-[speedStreaks_0.22s_linear_infinite]"
        style={{
          top: "-100%",
          height: "200%",
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 10px, rgba(255,255,255,0.06) 12px, rgba(255,255,255,0) 14px)",
        }}
      />

      {/* Cloud blobs — each is a multi-ellipse cloud shape */}
      {CLOUDS.map((c, i) => (
        <motion.div
          key={i}
          className="absolute top-0"
          style={{ left: c.left, width: c.w, height: c.h }}
          animate={{
            y: ["82vh", "8vh", "-100vh"],
            scale: [0.4, 1.6, 3.2],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: c.dur,
            delay: c.delay,
            repeat: Infinity,
            ease: [0.16, 0.0, 0.60, 1.0],
            times: [0, 0.42, 1],
          }}
        >
          <CloudShape />
        </motion.div>
      ))}

      {/* Bright horizon glow at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[24vh] bg-[linear-gradient(to_top,rgba(255,255,255,0.6)_0%,rgba(255,255,255,0)_100%)]" />

      {/* White-out on reveal */}
      <motion.div
        className="absolute inset-0 bg-white"
        animate={{ opacity: reveal ? 1 : 0 }}
        transition={{ duration: 0.40, ease: "easeIn" }}
      />
    </motion.div>
  );
}
