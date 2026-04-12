"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

type CloudTransitionSceneProps = {
  active: boolean;
  reveal: boolean;
};

const CLOUD_LAYERS = [
  {
    className:
      "left-[-8%] top-[6%] h-[32vh] w-[42vw] blur-[28px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.68) 34%, rgba(255,255,255,0.12) 70%, rgba(255,255,255,0) 100%)",
    duration: "7.8s",
    delay: "0s",
  },
  {
    className:
      "right-[-14%] top-[10%] h-[36vh] w-[48vw] blur-[34px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.62) 36%, rgba(255,255,255,0.12) 72%, rgba(255,255,255,0) 100%)",
    duration: "6.9s",
    delay: "-1.2s",
  },
  {
    className:
      "left-[6%] top-[34%] h-[28vh] w-[34vw] blur-[24px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.54) 35%, rgba(255,255,255,0.1) 70%, rgba(255,255,255,0) 100%)",
    duration: "6.3s",
    delay: "-0.7s",
  },
  {
    className:
      "right-[4%] top-[36%] h-[26vh] w-[30vw] blur-[22px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.48) 34%, rgba(255,255,255,0.08) 70%, rgba(255,255,255,0) 100%)",
    duration: "5.8s",
    delay: "-1.4s",
  },
  {
    className:
      "left-[-10%] bottom-[10%] h-[34vh] w-[40vw] blur-[30px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.58) 34%, rgba(255,255,255,0.1) 72%, rgba(255,255,255,0) 100%)",
    duration: "6.5s",
    delay: "-2.1s",
  },
  {
    className:
      "right-[-8%] bottom-[8%] h-[38vh] w-[44vw] blur-[32px]",
    background:
      "radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.62) 36%, rgba(255,255,255,0.1) 74%, rgba(255,255,255,0) 100%)",
    duration: "7.1s",
    delay: "-0.4s",
  },
];

export default function CloudTransitionScene({
  active,
  reveal,
}: CloudTransitionSceneProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500 ${
        active ? "opacity-100" : "opacity-0"
      } ${reveal ? "duration-700 opacity-0" : ""}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(136,166,205,0.88)_0%,rgba(209,223,239,0.92)_42%,rgba(245,247,250,0.94)_100%)]" />
      <div
        className={`absolute inset-0 transition-[transform,opacity,filter] duration-[1100ms] ease-out ${
          active ? "scale-100 opacity-100 blur-0" : "scale-[1.08] opacity-0 blur-[8px]"
        } ${reveal ? "scale-[1.05] opacity-0 blur-[10px]" : ""}`}
      >
        <Image
          src="/clouds.jpg"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.48)_0%,rgba(252,253,255,0.24)_28%,rgba(235,240,247,0.14)_58%,rgba(214,226,241,0.08)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.16)_52%,rgba(232,237,244,0.14)_100%)]" />

      {CLOUD_LAYERS.map((layer, index) => (
        <div
          key={index}
          className={`absolute ${layer.className} ${active ? "animate-[cloudDrift_var(--cloud-duration)_linear_infinite]" : ""}`}
          style={
            {
              background: layer.background,
              animationDelay: layer.delay,
              ["--cloud-duration" as string]: layer.duration,
            } as CSSProperties
          }
        />
      ))}

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.24)_24%,rgba(235,240,247,0.18)_48%,rgba(213,222,235,0.12)_100%)]" />
    </div>
  );
}
