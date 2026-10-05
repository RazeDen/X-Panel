import Link from "next/link";
export default function NotFound() {
  return (
    <div className="card mx-auto mt-16 max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-[13px] text-muted">That page or post does not exist in the database.</p>
      <Link href="/" className="btn mt-4">Back to overview</Link>
    </div>
  );
}
