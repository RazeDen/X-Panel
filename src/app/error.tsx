"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-16 max-w-xl p-8">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 break-words text-[13px] leading-5 text-muted">{error.message}</p>
      <button className="btn mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
