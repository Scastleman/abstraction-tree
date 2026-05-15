export function getGoals(req, res) {
  res.json([{ user: req.user.id, text: "Protect goals dashboard" }]);
}

export function createGoal(req, res) {
  res.status(201).json({ user: req.user.id, text: req.body.text });
}
