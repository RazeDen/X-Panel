import Link from "next/link";

/**
 * Post thumbnail in the YouTube Studio style: 16:9 media preview (or a hatched block when the post
 * has no media / no preview yet), the post's first words over a bottom gradient, series chip top-left.
 * Links to the post page.
 */
export function PostPreview({ id, image, text, series, wide = false }: { id: number; image: string | null; text: string; series: string | null; wide?: boolean }) {
  const aspect = wide ? "aspect-[2/1]" : "aspect-video";
  return (
    <Link href={`/posts/${id}`} className="group relative block overflow-hidden rounded-[8px] border border-line">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className={`${aspect} w-full object-cover transition-opacity group-hover:opacity-90`} />
      ) : (
        <div className={`hatch ${aspect} w-full bg-sunken`} />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-2.5 pt-8">
        <p className="line-clamp-2 text-[13px] font-semibold leading-[18px] text-white">{text}</p>
      </div>
      {series && series !== "Other" && <span className="chip absolute left-2 top-2 bg-black/70 text-white">{series}</span>}
    </Link>
  );
}
