"use client";

import { motion } from "framer-motion";

type CloudTransitionSceneProps = {
  active: boolean;
  reveal: boolean;
};

const CLOUDS = [
  { left: "-8%",  w: "58vw", h: "44vh", dur: 1.10, delay: 0     },
  { left: "44%",  w: "50vw", h: "38vh", dur: 1.28, delay: -0.38 },
  { left: "-20%", w: "44vw", h: "32vh", dur: 0.96, delay: -0.64 },
  { left: "26%",  w: "56vw", h: "46vh", dur: 1.22, delay: -0.52 },
  { left: "-4%",  w: "64vw", h: "52vh", dur: 1.50, delay: -0.24 },
  { left: "16%",  w: "38vw", h: "28vh", dur: 0.88, delay: -0.76 },
  { left: "56%",  w: "46vw", h: "36vh", dur: 1.08, delay: -0.16 },
  { left: "-26%", w: "66vw", h: "54vh", dur: 1.55, delay: -0.44 },
];

function CloudShape() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: "8%",  bottom: "2%",  width: "84%", height: "50%", background: "white", borderRadius: "50%", opacity: 0.98 }} />
      <div style={{ position: "absolute", left: "4%",  bottom: "22%", width: "40%", height: "68%", background: "white", borderRadius: "50%", opacity: 0.97 }} />
      <div style={{ position: "absolute", left: "22%", bottom: "32%", width: "48%", height: "80%", background: "white", borderRadius: "50%", opacity: 0.98 }} />
      <div style={{ position: "absolute", left: "44%", bottom: "28%", width: "36%", height: "70%", background: "white", borderRadius: "50%", opacity: 0.96 }} />
      <div style={{ position: "absolute", left: "60%", bottom: "18%", width: "34%", height: "56%", background: "white", borderRadius: "50%", opacity: 0.95 }} />
    </div>
  );
}

export default function CloudTransitionScene({ active, reveal }: CloudTransitionSceneProps) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: active ? 0.55 : 0.7, ease: "easeInOut" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#1a5fa8_0%,#3b87cc_35%,#7ab8e8_70%,#c4dff5_100%)]" />

      <div
        className="absolute left-0 right-0 animate-[speedStreaks_0.22s_linear_infinite]"
        style={{
          top: "-100%",
          height: "200%",
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 10px, rgba(255,255,255,0.06) 12px, rgba(255,255,255,0) 14px)",
        }}
      />

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

      <div className="absolute bottom-0 left-0 right-0 h-[24vh] bg-[linear-gradient(to_top,rgba(255,255,255,0.6)_0%,rgba(255,255,255,0)_100%)]" />

      <motion.div
        className="absolute inset-0 bg-white"
        animate={{ opacity: reveal ? 1 : 0 }}
        transition={{ duration: 0.40, ease: "easeIn" }}
      />
    </motion.div>
  );
}
