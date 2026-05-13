import {
  buildChangeRecordReviewSummary,
  limitChangeRecordReviewReport,
  reviewChangeRecords
} from "@abstraction-tree/core";

export interface ChangeReviewCommandOptions {
  projectRoot: string;
  summary?: boolean;
  limit?: unknown;
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

const defaultIo: ChangeReviewCommandIo = {
  stdout: text => console.log(text),
  stderr: text => console.error(text)
};

function positiveIntegerOption(input: unknown): number | undefined {
  if (input === undefined) return undefined;
  const parsed = Number(input);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
