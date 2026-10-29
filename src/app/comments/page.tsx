import Link from "next/link";
import { COMMENT_MAX_AGE_HOURS, commentCounts, commentsStatus, draftMessage, listComments, type CommentStatus, type CommentView } from "@/lib/comments/data";
import { twitterApiKey } from "@/lib/comments/twitterapi";
import { formatDateTime } from "@/lib/time";
import { fmtInt, preview } from "@/lib/format";
import { Chip, Empty, Notice, PageHeader } from "@/components/ui";
import { UrlTabs } from "@/components/filters";
import { CommentActions, RefreshComments } from "@/components/CommentActions";
import { requestAccountKey } from "@/lib/request-account";
import { enterAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";

function CommentCard({ c, draft }: { c: CommentView; draft: string | null }) {
  const handle = c.author.username ? `@${c.author.username}` : "unknown account";
  const root = c.root ?? (c.parent && !c.parent.isReply ? c.parent : null);
  return (
    <div className="card card-pad">
      <div className="flex items-start gap-3">
        {c.author.avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.author.avatar} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 rounded-full border border-line" />
          : <div aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised text-[12px] font-semibold text-ink">{(c.author.name ?? c.author.username ?? "?").charAt(0).toUpperCase()}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
            <span className="font-semibold text-ink">{c.author.name ?? handle}</span>
            {c.author.name && <span className="text-muted">{handle}</span>}
            <span className="text-muted">&middot; {c.createdLabel}</span>
            {c.likeCount ? <span className="num text-muted">&middot; {fmtInt(c.likeCount)} {c.likeCount === 1 ? "like" : "likes"}</span> : null}
            {c.status === "answered" && <span className="ml-auto"><Chip tone="good">answered</Chip></span>}
            {c.status === "hidden" && <span className="ml-auto"><Chip>hidden</Chip></span>}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-[21px] text-ink">{c.text}</p>
          <div className="mt-3 flex items-center gap-3 rounded-[8px] bg-sunken p-2 pr-3 text-xs leading-5">
            {root && (root.mediaPreview
              // eslint-disable-next-line @next/next/no-img-element
              ? <Link href={`/posts/${root.id}`} className="shrink-0"><img src={root.mediaPreview} alt="" loading="lazy" className="aspect-video w-28 rounded-[6px] border border-line object-cover" /></Link>
              : <div aria-hidden className="hatch aspect-video w-28 shrink-0 rounded-[6px] border border-line bg-page" />)}
            <div className="min-w-0">
              {root
                ? <><span className="text-muted">On your post </span><Link href={`/posts/${root.id}`} className="text-ink2 hover:text-ink hover:underline">{preview(root.text, 160)}</Link></>
                : <span className="text-muted">On a post that is not in the database (older than the sync window).</span>}
              {c.parent?.isReply && <div className="mt-1"><span className="text-muted">Replying to your reply </span><span className="text-ink2">{preview(c.parent.text.replace(/^(?:@\w+\s+)+/, ""), 140)}</span></div>}
            </div>
          </div>
          {c.myReply && (
            <div className="mt-2 text-xs leading-5"><span className="text-muted">Your reply </span><a href={c.myReply.url} target="_blank" rel="noreferrer" className="text-ink2 hover:text-ink hover:underline">{preview(c.myReply.text, 200)}</a></div>
          )}
          <div className="mt-3 border-t border-line pt-3">
            <CommentActions id={c.id} url={c.url} draft={draft} hidden={c.status === "hidden"} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function CommentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  enterAccount(await requestAccountKey());
  const sp = await searchParams;
  const show: CommentStatus = sp.show === "answered" || sp.show === "hidden" ? sp.show : "open";
  const counts = commentCounts();
  const comments = listComments(show);
  const status = commentsStatus();
  const hasKey = !!twitterApiKey();
  const empty = { open: `No comments from the last ${COMMENT_MAX_AGE_HOURS} hours waiting for an answer.`, answered: "No answered comments yet.", hidden: "Nothing hidden." }[show];

  return (
    <>
      <PageHeader title="Comments"
        subtitle={`Replies to your posts from the last ${COMMENT_MAX_AGE_HOURS} hours that you have not answered yet. "Draft in Claude" copies the post and the comment for your Claude chat; reply on X - an answered comment leaves this list by itself within about 15 minutes.`}
        tabs={<UrlTabs param="show" fallback="open" variant="underline" options={[
          { key: "open", label: `To answer · ${counts.open}` },
          { key: "answered", label: `Answered · ${counts.answered}` },
          { key: "hidden", label: `Hidden · ${counts.hidden}` },
        ]} />}>
        <span className="text-xs text-muted">{status.lastFetch ? `Checked ${formatDateTime(status.lastFetch)}` : "Not checked yet"}</span>
        {hasKey && <RefreshComments />}
      </PageHeader>
      {!hasKey && <div className="mb-4"><Notice tone="warn" title="No twitterapi.io key">Add your key as TWITTERAPI_IO_KEY in .env on the server, then restart the dashboard. Comments are read through twitterapi.io (about $0.15 per 1,000 comments, author name and avatar included).</Notice></div>}
      {status.lastError && <div className="mb-4"><Notice tone="error" title="The last comment check failed">{status.lastError}</Notice></div>}
      {comments.length
        ? <div className="flex flex-col gap-3">{comments.map((c) => <CommentCard key={c.id} c={c} draft={show === "open" ? draftMessage(c) : null} />)}</div>
        : <Empty>{empty}</Empty>}
    </>
  );
}
