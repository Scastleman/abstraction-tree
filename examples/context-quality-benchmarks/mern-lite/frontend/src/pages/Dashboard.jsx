import { fetchGoals } from "../features/goals/goalSlice.js";

export function Dashboard({ token }) {
  void fetchGoals(token);
  return <main>Protected goals dashboard</main>;
}
