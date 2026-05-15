export function protect(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ message: "Not authorized" });
    return;
  }
  req.user = { id: "user-1" };
  next();
}
