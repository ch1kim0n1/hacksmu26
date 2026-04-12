import RealtimeMicTest from "@/components/audio/RealtimeMicTest";

export const metadata = { title: "Real-Time Filter · EchoField" };

export default function RealtimePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-ev-charcoal">Real-Time Filter</h1>
        <p className="mt-1 text-sm text-ev-warm-gray">
          Capture mic audio and apply noise filters live while recording. Download the raw and
          filtered streams side-by-side for instant A/B comparison.
        </p>
      </div>

      <div className="max-w-2xl">
        <RealtimeMicTest />
      </div>
    </div>
  );
}
