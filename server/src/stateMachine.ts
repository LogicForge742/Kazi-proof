import { MilestoneStatus as S } from '@prisma/client';

// The only legal moves. Nothing else may change a milestone's status,
// and money moves only through these transitions, never on an AI verdict alone.
const allowed: Record<S, S[]> = {
  PLANNED: ['ACTIVE'],
  ACTIVE: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'FLAGGED'],
  UNDER_REVIEW: ['APPROVED', 'FLAGGED', 'DISPUTED'],
  FLAGGED: ['SUBMITTED', 'APPROVED', 'DISPUTED'],
  APPROVED: ['RELEASED'],
  DISPUTED: ['ACTIVE', 'APPROVED'],
  RELEASED: [],
};

export function canTransition(from: S, to: S): boolean {
  return allowed[from].includes(to);
}

export function assertTransition(from: S, to: S): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal milestone transition ${from} -> ${to}`);
  }
}
