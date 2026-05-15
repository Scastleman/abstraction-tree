import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Eye, Filter } from "lucide-react";
import type {
  CoherenceReviewView,
  GoalWorkspaceView,
  MissionPlanStageView,
  ScopeReviewView,
  ScopeSelectionItem,
  WorkflowReference,
  WorkflowViewState
} from "@abstraction-tree/core";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { DiffView, type DiffViewItem } from "./DiffView.js";
import { Timeline } from "./Timeline.js";
import { WorkflowList, type WorkflowListItem } from "./WorkflowList.js";

export interface GoalWorkflowPanelProps {
  workflow?: WorkflowViewState;
  apiToken?: string;
}

type ScopeFilter = "all" | "high-impact" | "questionable";

export function GoalWorkflowPanel({ apiToken, workflow }: GoalWorkflowPanelProps) {
  const goals = workflow?.goalWorkspaces ?? [];
  const scopes = workflow?.scopeReviews ?? [];
  const coherenceReviews = workflow?.coherenceReviews ?? [];
  const [selectedGoalId, setSelectedGoalId] = useState(() => goals[0]?.id ?? "");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  useEffect(() => {
    if (!goals.length) {
      setSelectedGoalId("");
      return;
    }
    if (!goals.some(goal => goal.id === selectedGoalId)) setSelectedGoalId(goals[0].id);
  }, [goals, selectedGoalId]);

  const selectedGoal = goals.find(goal => goal.id === selectedGoalId) ?? goals[0];
  const selectedScope = scopes.find(scope => scope.id === selectedGoal?.scopeReviewId) ?? scopes[0];
  const selectedCoherence = coherenceReviews.find(review => review.id === selectedGoal?.coherenceReviewId) ?? coherenceReviews[0];

  if (!workflow || (!goals.length && !scopes.length && !coherenceReviews.length && !workflow.contextPacks.length)) {
    return <p className="muted">No goal workspaces, scope checks, coherence reviews, or context packs are available yet.</p>;
  }

  return (
    <div className="workflow-view">
      <div className="workflow-metrics">
        <Metric label="Goal workspaces" value={goals.length} />
        <Metric label="Scope reviews" value={scopes.length} />
        <Metric label="Coherence reviews" value={coherenceReviews.length} />
        <Metric label="Context packs" value={workflow.contextPacks.length} />
      </div>

      <div className="workflow-layout">
        <section className="workflow-column">
          <h3>Goal Workspaces</h3>
          <WorkflowList
            emptyText="No goal workspaces have been generated."
            items={goals.map(goal => goalListItem(goal, selectedGoal?.id, setSelectedGoalId))}
          />
        </section>

        <section className="workflow-column wide">
          {selectedGoal ? (
            <GoalWorkspaceDetails apiToken={apiToken} goal={selectedGoal} />
          ) : (
            <p className="muted">Select a goal workspace to inspect mission planning details.</p>
          )}
        </section>
      </div>

      <div className="workflow-layout lower">
        <section className="workflow-column">
          <h3>Scope And Coherence</h3>
          <ScopeReviewBlock apiToken={apiToken} filter={scopeFilter} onFilterChange={setScopeFilter} scope={selectedScope} />
          <CoherenceReviewBlock apiToken={apiToken} review={selectedCoherence} />
        </section>

        <section className="workflow-column">
          <h3>Context Packs</h3>
          <WorkflowList
            emptyText="No context packs are available."
            items={workflow.contextPacks.map(pack => ({
              id: pack.id,
              title: pack.target,
              meta: pack.createdAt ? displayTimestamp(pack.createdAt) : pack.id,
              detail: `${pack.stats.files} files, ${pack.stats.concepts} concepts, ${pack.stats.invariants} invariants`,
              tone: pack.stats.excludedDiagnostics ? "warn" : undefined,
              action: <ReferenceButton apiToken={apiToken} reference={{ label: pack.id, path: pack.file, kind: "context-pack", targetId: pack.id }} />
            }))}
          />
        </section>
      </div>
    </div>
  );
}

function GoalWorkspaceDetails({ apiToken, goal }: { apiToken?: string; goal: GoalWorkspaceView }) {
  const timelineItems = goal.missionStages.map(stage => ({
    id: stage.id,
    title: stage.title,
    status: stage.status,
    summary: stage.summary,
    children: <StageDetails apiToken={apiToken} stage={stage} />
  }));

  return (
    <div className="workflow-detail">
      <div className="workflow-detail-header">
        <div>
          <span className={`status-chip ${toneForStatus(goal.status)}`}>{goal.status}</span>
          <h3>{goal.title}</h3>
          <p>{goal.summary}</p>
        </div>
        <div className="workflow-score">
          <strong>{typeof goal.score === "number" ? goal.score : "?"}</strong>
          <span>score</span>
        </div>
      </div>

      <div className="workflow-metrics compact">
        <Metric label="Affected files" value={goal.stats.affectedFileCount} />
        <Metric label="Planned tasks" value={goal.stats.plannedTaskCount} />
        <Metric label="Unresolved" value={goal.stats.unresolvedItemCount} />
        <Metric label="Checks" value={goal.stats.checkCount} />
      </div>

      <CollapsibleSection defaultOpen meta={`${goal.reports.length} artifact(s)`} title="Reports">
        <ReferenceList apiToken={apiToken} references={goal.reports} />
      </CollapsibleSection>

      <CollapsibleSection defaultOpen meta={`${goal.missionStages.length} stage(s)`} title="Mission Plan">
        <Timeline items={timelineItems} />
      </CollapsibleSection>

      <CollapsibleSection meta={`${goal.missions.length} mission(s)`} title="Mission Tasks">
        <WorkflowList
          emptyText="No mission tasks are available."
          items={goal.missions.map(mission => ({
            id: mission.id,
            title: mission.title,
            meta: [mission.priority, mission.risk].filter(Boolean).join(" / "),
            detail: `${mission.affectedAreas.join(", ") || "project"}; ${mission.successChecks.length} check(s)`,
            tone: mission.risk === "high" ? "bad" : mission.risk === "medium" ? "warn" : undefined,
            action: mission.evidence[0] ? <ReferenceButton apiToken={apiToken} reference={mission.evidence[0]} /> : undefined
          }))}
        />
      </CollapsibleSection>
    </div>
  );
}

function StageDetails({ apiToken, stage }: { apiToken?: string; stage: MissionPlanStageView }) {
  return (
    <div className="stage-details">
      <ReferenceGroup label="Actions" values={stage.actions} />
      <ReferenceGroup apiToken={apiToken} label="Context packs" references={stage.contextPacks} />
      <ReferenceGroup apiToken={apiToken} label="Evidence" references={stage.evidence} />
    </div>
  );
}

function ScopeReviewBlock({
  apiToken,
  filter,
  onFilterChange,
  scope
}: {
  apiToken?: string;
  filter: ScopeFilter;
  onFilterChange: (filter: ScopeFilter) => void;
  scope?: ScopeReviewView;
}) {
  const filteredSelections = useMemo(() => filterScopeSelections(scope?.selections ?? [], filter), [filter, scope]);

  if (!scope) return <p className="muted">No scope output is available.</p>;

  return (
    <CollapsibleSection defaultOpen meta={scope.status} title="Scope Review">
      <p className="workflow-summary-text">{scope.summary}</p>
      <div className="workflow-metrics compact">
        <Metric label="Selected" value={scope.stats.selectedCount} />
        <Metric label="Excluded" value={scope.stats.excludedCount} />
        <Metric label="Questionable" value={scope.stats.questionableCount} />
        <Metric label="Violations" value={scope.stats.violationCount} />
      </div>
      <div className="filter-row" role="group" aria-label="Scope selection filter">
        <Filter aria-hidden="true" size={16} />
        <FilterButton active={filter === "all"} label="All" onClick={() => onFilterChange("all")} />
        <FilterButton active={filter === "high-impact"} label="High impact" onClick={() => onFilterChange("high-impact")} />
        <FilterButton active={filter === "questionable"} label="Questionable" onClick={() => onFilterChange("questionable")} />
      </div>
      <DiffView
        emptyText="No scope selections match this filter."
        items={filteredSelections.map(scopeDiffItem)}
      />
      <ReferenceList apiToken={apiToken} references={scope.evidence} />
    </CollapsibleSection>
  );
}

function CoherenceReviewBlock({ apiToken, review }: { apiToken?: string; review?: CoherenceReviewView }) {
  if (!review) return <p className="muted">No coherence review is available.</p>;

  return (
    <CollapsibleSection defaultOpen meta={review.status} title="Coherence Review">
      <p className="workflow-summary-text">{review.summary}</p>
      <WorkflowList
        emptyText="No coherence findings are available."
        items={review.findings.map(finding => ({
          id: finding.label,
          title: finding.label,
          detail: finding.value,
          tone: finding.tone === "good" ? "good" : finding.tone === "bad" ? "bad" : finding.tone === "warn" ? "warn" : undefined
        }))}
      />
      <ReferenceList apiToken={apiToken} references={review.evidence} />
    </CollapsibleSection>
  );
}

function ReferenceGroup({
  apiToken,
  label,
  references,
  values
}: {
  apiToken?: string;
  label: string;
  references?: WorkflowReference[];
  values?: string[];
}) {
  const hasValues = values?.length;
  const hasRefs = references?.length;
  if (!hasValues && !hasRefs) return null;

  return (
    <div className="reference-group">
      <span>{label}</span>
      {hasValues ? (
        <ul>
          {values.map(value => <li key={value}>{value}</li>)}
        </ul>
      ) : null}
      {hasRefs ? <ReferenceList apiToken={apiToken} references={references ?? []} /> : null}
    </div>
  );
}

function ReferenceList({ apiToken, references }: { apiToken?: string; references: WorkflowReference[] }) {
  if (!references.length) return <p className="muted">No artifact references are available.</p>;

  return (
    <div className="reference-list">
      {references.map(reference => <ReferenceLink apiToken={apiToken} key={`${reference.kind}-${reference.path}-${reference.label}`} reference={reference} />)}
    </div>
  );
}

function ReferenceLink({ apiToken, reference }: { apiToken?: string; reference: WorkflowReference }) {
  const body = (
    <>
      {canOpenArtifact(reference.path) ? <ExternalLink aria-hidden="true" size={14} /> : null}
      <span>{reference.label}</span>
      <code>{reference.path}</code>
    </>
  );

  if (!canOpenArtifact(reference.path)) {
    return <div className="reference-link static">{body}</div>;
  }

  return (
    <a
      className="reference-link"
      href={artifactHref(reference.path)}
      onClick={apiToken ? event => {
        event.preventDefault();
        void openArtifactWithToken(reference.path, apiToken);
      } : undefined}
      rel="noreferrer"
      target="_blank"
    >
      {body}
    </a>
  );
}

function ReferenceButton({ apiToken, reference }: { apiToken?: string; reference: WorkflowReference }) {
  if (!canOpenArtifact(reference.path)) return null;

  return (
    <a
      aria-label={`Open ${reference.label}`}
      className="icon-action"
      href={artifactHref(reference.path)}
      onClick={apiToken ? event => {
        event.preventDefault();
        void openArtifactWithToken(reference.path, apiToken);
      } : undefined}
      rel="noreferrer"
      target="_blank"
    >
      <ExternalLink aria-hidden="true" size={15} />
    </a>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? "filter-button active" : "filter-button"} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="workflow-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function goalListItem(
  goal: GoalWorkspaceView,
  selectedGoalId: string | undefined,
  onSelect: (id: string) => void
): WorkflowListItem {
  return {
    id: goal.id,
    title: goal.title,
    meta: [goal.status, goal.mode, displayTimestamp(goal.createdAt)].filter(Boolean).join(" / "),
    detail: `${goal.stats.affectedFileCount} files, ${goal.stats.plannedTaskCount} tasks, ${goal.stats.unresolvedItemCount} unresolved`,
    tone: toneForStatus(goal.status),
    selected: goal.id === selectedGoalId,
    action: (
      <button aria-label={`Inspect ${goal.title}`} className="icon-action" onClick={() => onSelect(goal.id)} type="button">
        <Eye aria-hidden="true" size={15} />
      </button>
    )
  };
}

function scopeDiffItem(item: ScopeSelectionItem): DiffViewItem {
  return {
    id: item.id,
    label: item.label,
    meta: `${item.kind} / ${item.impact}`,
    detail: item.reason,
    status: item.status,
    impact: item.impact
  };
}

function filterScopeSelections(items: ScopeSelectionItem[], filter: ScopeFilter): ScopeSelectionItem[] {
  if (filter === "high-impact") return items.filter(item => item.impact === "high");
  if (filter === "questionable") return items.filter(item => item.status === "questionable" || item.status === "excluded");
  return items;
}

function toneForStatus(status: string): "good" | "warn" | "bad" | undefined {
  if (["success", "clean", "ready", "passed", "complete"].includes(status)) return "good";
  if (["failed", "blocked", "execution-refused"].includes(status)) return "bad";
  if (["partial", "warning", "needs-clarification", "planned", "pending", "not-run"].includes(status)) return "warn";
  return undefined;
}

function artifactHref(path: string): string {
  return `/api/artifact?path=${encodeURIComponent(path)}`;
}

async function openArtifactWithToken(path: string, apiToken: string): Promise<void> {
  try {
    const response = await fetch(artifactHref(path), {
      headers: {
        authorization: `Bearer ${apiToken}`
      }
    });
    if (!response.ok) return;

    const text = await response.text();
    const objectUrl = URL.createObjectURL(new Blob([text], {
      type: response.headers.get("content-type") ?? "text/plain; charset=utf-8"
    }));
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    // Keep the visual app usable even when a protected artifact cannot be opened.
  }
}

function canOpenArtifact(path: string): boolean {
  return /\.(json|md|txt|log)$/iu.test(path);
}

function displayTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}
