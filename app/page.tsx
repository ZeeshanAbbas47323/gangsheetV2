import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-0 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
        Gangsheet Builder
        <span className="block text-lg font-normal text-gray-400 sm:text-xl">
          by ModFirst
        </span>
      </h1>
      <p className="max-w-xl text-balance text-gray-400">
        Build print-ready DTF gang sheets in your browser. Drag, nest, and
        arrange your designs on professional sheet sizes — then export at full
        print resolution.
      </p>
      <Link
        href="/builder"
        className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        Open the builder
      </Link>
    </main>
  );
}
