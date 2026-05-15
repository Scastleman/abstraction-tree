export async function fetchGoals(token) {
  const response = await fetch("/api/goals", {
    headers: { authorization: `Bearer ${token}` }
  });
  return response.json();
}

export const goalSlice = {
  name: "goals",
  fetchGoals
};
