import express from "express";
import { goalRouter } from "./routes/goalRoutes.js";

const app = express();
app.use(express.json());
app.use("/api/goals", goalRouter);

export default app;
