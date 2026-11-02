export type TeachingWindow = {
  preparedAt: string;
  previousTtl: number;
  courses: { course: string; deliveryChecked: boolean; learnerDeadline: string }[];
  educatorReportingChecked: boolean;
};

export function cutoverDecision(plan: TeachingWindow, now: number): string {
  if (now < Date.parse(plan.preparedAt) + plan.previousTtl * 1000) {
    return 'Wait for the previous TTL to expire';
  }
  if (!plan.educatorReportingChecked || plan.courses.some(c => !c.deliveryChecked)) {
    return 'Check course delivery and educator reporting first';
  }
  if (plan.courses.some(c => Date.parse(c.learnerDeadline) <= now + 30 * 60 * 1000)) {
    return 'Keep the current host while a learner deadline is close';
  }
  return 'ready';
}
