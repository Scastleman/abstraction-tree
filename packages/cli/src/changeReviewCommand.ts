import {
  buildChangeRecordReviewSummary,
  limitChangeRecordReviewReport,
  pruneGeneratedScanRecords,
  reviewChangeRecords
} from "@abstraction-tree/core";

export interface ChangeReviewCommandOptions {
  projectRoot: string;
  summary?: boolean;
  limit?: unknown;
}

export interface ChangePruneGeneratedCommandOptions {
  projectRoot: string;
  apply?: boolean;
}

export interface ChangeReviewCommandIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export async function runChangeReviewCommand(
  options: ChangeReviewCommandOptions,
  io: ChangeReviewCommandIo = defaultIo
): Promise<number> {
  const limit = positiveIntegerOption(options.limit);
  if (options.limit !== undefined && limit === undefined) {
    io.stderr("Change review limit must be a positive integer.");
    return 1;
  }

  const report = await reviewChangeRecords(options.projectRoot);
  io.stdout(JSON.stringify(
    options.summary ? buildChangeRecordReviewSummary(report) : limitChangeRecordReviewReport(report, limit),
    null,
    2
  ));
  return 0;
}

export async function runChangePruneGeneratedCommand(
  options: ChangePruneGeneratedCommandOptions,
  io: ChangeReviewCommandIo = defaultIo
): Promise<number> {
  const result = await pruneGeneratedScanRecords(options.projectRoot, {
    dryRun: !options.apply
  });

  io.stdout(JSON.stringify(result, null, 2));
  if (result.blockedByIssues) {
    io.stderr("Generated scan pruning was blocked because change records have validation issues.");
    return 1;
  }
  if (!options.apply && result.eligibleGeneratedScanRecordCount > 0) {
    io.stderr("Dry run only. Re-run with `--apply` to delete superseded generated scan records.");
  }
  return 0;
}

const defaultIo: ChangeReviewCommandIo = {
  stdout: text => console.log(text),
  stderr: text => console.error(text)
};

function positiveIntegerOption(input: unknown): number | undefined {
  if (input === undefined) return undefined;
  const parsed = Number(input);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
