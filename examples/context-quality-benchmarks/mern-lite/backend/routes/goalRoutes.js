import { Router } from "express";
import { getGoals, createGoal } from "../controllers/goalController.js";
import { protect } from "../middleware/authMiddleware.js";

export const goalRouter = Router();

goalRouter.route("/").get(protect, getGoals).post(protect, createGoal);
