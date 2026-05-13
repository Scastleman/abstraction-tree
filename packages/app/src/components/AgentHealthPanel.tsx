import type { AgentHealth } from "@abstraction-tree/core";

export interface AgentHealthPanelProps {
  health?: AgentHealth;
}

export function AgentHealthPanel({ health }: AgentHealthPanelProps) {
  if (!health) return <p className="muted">No agent health data is available.</p>;

  const runResult = health.latestRun?.result ?? "unknown";
  return (
    <div className="health-grid">
      <HealthItem
        label="Latest run"
        value={runResult}
        detail={health.latestRun?.task ?? "No run report found."}
        tone={toneForRun(runResult)}
      />
      <HealthItem
        label="Latest evaluation"
        value={displayTimestamp(health.latestEvaluation?.timestamp)}
        detail={evaluationDetail(health.latestEvaluation)}
      />
      <HealthItem
        label="Validation issues"
        value={displayCount(health.validation?.issueCount)}
        detail={validationDetail(health.validation)}
        tone={health.validation?.issueCount ? "warn" : "good"}
      />
      <HealthItem
        label="Automation limits"
        value={automationLimit(health.automation)}
        detail={automationDetail(health.automation)}
        tone={health.automation?.stopRequested ? "warn" : undefined}
      />
      <HealthItem
        label="Scope contract"
        value={scopeStatus(health.scope)}
        detail={scopeDetail(health.scope)}
        tone={scopeTone(health.scope)}
      />
    </div>
  );
}

function HealthItem({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className={tone ? `health-item ${tone}` : "health-item"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function displayTimestamp(value?: string): string {
  if (!value) return "Unknown";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

function displayCount(value?: number): string {
  return typeof value === "number" ? String(value) : "Unknown";
}

function evaluationDetail(evaluation?: AgentHealth["latestEvaluation"]): string {
  if (!evaluation) return "No evaluation report found.";
  const issues = typeof evaluation.issueCount === "number" ? `${evaluation.issueCount} eval issues` : "eval issues unknown";
  const stale = typeof evaluation.staleFileCount === "number" ? evaluation.staleFileCount : "?";
  const missing = typeof evaluation.missingFileCount === "number" ? evaluation.missingFileCount : "?";
  return `${issues}; drift stale ${stale}, missing ${missing}`;
}

function validationDetail(validation?: AgentHealth["validation"]): string {
  if (!validation) return "Validation status unavailable.";
  return `${validation.errorCount} errors, ${validation.warningCount} warnings`;
}

function automationLimit(automation?: AgentHealth["automation"]): string {
  if (!automation) return "Unknown";
  const loops = limitPair(automation.loopsToday, automation.maxLoopsToday);
  return loops ? `${loops} loops` : "Configured";
}

function automationDetail(automation?: AgentHealth["automation"]): string {
  if (!automation) return "Automation config not found.";
  const failed = limitPair(automation.failedLoopsToday, automation.maxFailedLoops);
  const pieces = [
    failed ? `${failed} failed` : undefined,
    typeof automation.maxDiffLines === "number" ? `${automation.maxDiffLines} max diff lines` : undefined,
    automation.stopRequested ? "stop requested" : undefined
  ].filter(Boolean);
  return pieces.join("; ") || "No runtime limits reported.";
}

function scopeStatus(scope?: AgentHealth["scope"]): string {
  return scope?.status ?? "Unknown";
}

function scopeDetail(scope?: AgentHealth["scope"]): string {
  if (!scope) return "No scope contract found.";
  const pieces = [
    scope.requiresClarification ? "clarification requested" : undefined,
    typeof scope.violationCount === "number" ? `${scope.violationCount} violations` : undefined,
    typeof scope.allowedFileCount === "number" ? `${scope.allowedFileCount} allowed files` : undefined,
    scope.prompt
  ].filter(Boolean);
  return pieces.join("; ");
}

function scopeTone(scope?: AgentHealth["scope"]): "good" | "warn" | "bad" | undefined {
  if (!scope) return undefined;
  if (scope.status === "blocked") return "bad";
  if (scope.status === "warning" || scope.status === "needs-clarification") return "warn";
  if (scope.status === "clean" || scope.status === "ready") return "good";
  return undefined;
}

function limitPair(current?: number, max?: number): string | undefined {
  if (typeof current === "number" && typeof max === "number") return `${current}/${max}`;
  if (typeof max === "number") return `max ${max}`;
  return undefined;
}

function toneForRun(result: string): "good" | "warn" | "bad" | undefined {
  if (result === "success") return "good";
  if (result === "failed") return "bad";
  if (result === "partial" || result === "unknown") return "warn";
  return undefined;
}
