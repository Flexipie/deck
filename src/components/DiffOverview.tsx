import type { DiffSummary } from "../lib/diffSummary";

interface DiffOverviewProps {
  summary: DiffSummary;
  base: string;
  head: string;
  reviewing: boolean;
  reviewElapsedMs: number | null;
  skippedAnnotations: number;
}

export function DiffOverviewHeader({
  summary,
  base,
  head,
  reviewing,
  reviewElapsedMs,
  skippedAnnotations,
}: DiffOverviewProps) {
  return (
    <div className="deck-diff-overview">
      <div className="deck-diff-title">
        <span className="deck-diff-title-kicker">Diff review</span>
        <span className="deck-diff-title-main">
          <span className="deck-diff-title-branch">{head || "head"}</span>
          <span className="deck-diff-title-muted">against {base || "base"}</span>
        </span>
      </div>
      <div className="deck-diff-metrics" aria-label="Diff summary">
        <Metric label="Files" value={summary.filesChanged} />
        <Metric label="Lines" value={formatChurn(summary.addedLines, summary.deletedLines)} />
        <Metric label="Notes" value={summary.annotations.total} tone={annotationTone(summary)} />
        <ReviewState
          reviewing={reviewing}
          reviewElapsedMs={reviewElapsedMs}
          skippedAnnotations={skippedAnnotations}
        />
      </div>
    </div>
  );
}

export function DiffOverviewSidebar({ summary, base, head }: DiffOverviewProps) {
  return (
    <section className="deck-diff-tree-overview" aria-label="Diff overview">
      <div className="deck-tree-overview-head">
        <span className="deck-tree-overview-label">Current diff</span>
        <span className="deck-tree-overview-refs">
          {shortRef(base)} / {shortRef(head)}
        </span>
      </div>

      <div className="deck-tree-overview-stats">
        <MiniStat label="Files" value={summary.filesChanged} />
        <MiniStat label="Hunks" value={summary.hunksChanged} />
        <MiniStat label="Net" value={formatSigned(summary.netLines)} />
      </div>

      <div className="deck-tree-churn" aria-label="Changed lines">
        <div className="deck-tree-churn-row">
          <span>Added</span>
          <strong className="deck-tree-added">+{summary.addedLines}</strong>
        </div>
        <div className="deck-tree-churn-row">
          <span>Deleted</span>
          <strong className="deck-tree-deleted">-{summary.deletedLines}</strong>
        </div>
      </div>

      <AnnotationSummary summary={summary} />
      <HotFiles files={summary.largestFiles} />
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "good";
}) {
  return (
    <span className={`deck-diff-metric deck-diff-metric-${tone ?? "default"}`}>
      <span className="deck-diff-metric-label">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="deck-tree-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function ReviewState({
  reviewing,
  reviewElapsedMs,
  skippedAnnotations,
}: {
  reviewing: boolean;
  reviewElapsedMs: number | null;
  skippedAnnotations: number;
}) {
  if (reviewing) {
    return <Metric label="AI" value="Running" tone="warn" />;
  }
  if (reviewElapsedMs != null) {
    const suffix = skippedAnnotations > 0 ? `, ${skippedAnnotations} skipped` : "";
    return <Metric label="AI" value={`${formatSeconds(reviewElapsedMs)}${suffix}`} tone="good" />;
  }
  return <Metric label="AI" value="Ready" />;
}

function AnnotationSummary({ summary }: { summary: DiffSummary }) {
  if (summary.annotations.total === 0) {
    return <div className="deck-tree-annotation-empty">No active AI notes yet.</div>;
  }

  return (
    <div className="deck-tree-annotations">
      <div className="deck-tree-section-title">AI notes</div>
      <div className="deck-tree-note-grid">
        <span className="deck-note-count deck-note-blocker">{summary.annotations.blockers}</span>
        <span className="deck-note-count deck-note-suggestion">{summary.annotations.suggestions}</span>
        <span className="deck-note-count deck-note-nit">{summary.annotations.nits}</span>
      </div>
      <div className="deck-tree-note-labels">
        <span>Blockers</span>
        <span>Suggestions</span>
        <span>Nits</span>
      </div>
    </div>
  );
}

function HotFiles({ files }: { files: DiffSummary["largestFiles"] }) {
  if (files.length === 0) return null;
  return (
    <div className="deck-tree-hot-files">
      <div className="deck-tree-section-title">Largest files</div>
      {files.map((file) => (
        <div className="deck-tree-hot-file" key={file.path}>
          <span className="deck-tree-hot-path" title={file.path}>
            {file.path}
          </span>
          <span className="deck-tree-hot-churn">
            +{file.added} / -{file.deleted}
          </span>
        </div>
      ))}
    </div>
  );
}

function annotationTone(summary: DiffSummary): "default" | "warn" {
  return summary.annotations.blockers > 0 ? "warn" : "default";
}

function formatChurn(added: number, deleted: number): string {
  return `+${added} / -${deleted}`;
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
}

function shortRef(ref: string): string {
  if (!ref) return "-";
  if (ref.length <= 18) return ref;
  return `...${ref.slice(-15)}`;
}
