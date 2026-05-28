import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { clientLinkTokensRouter } from "./routes/clientLinkTokens";
import { clientAssignmentsRouter, clientsRouter } from "./routes/clients";
import { meRouter } from "./routes/me";
import { notificationsRouter } from "./routes/notifications";
import { nutritionRouter } from "./routes/nutrition";
import { exercisesRouter, plansRouter, workoutDaysRouter } from "./routes/plans";

const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "capacitor://localhost",
    "http://localhost"
  ],
  credentials: true
}));

app.use(express.json());
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/client-link-tokens", clientLinkTokensRouter);
app.use("/api/v1/clients", clientsRouter);
app.use("/api/v1/me", meRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/nutrition", nutritionRouter);
app.use("/api/v1/plans", plansRouter);
app.use("/api/v1/workout-days", workoutDaysRouter);
app.use("/api/v1/exercises", exercisesRouter);
app.use("/api/v1/client-assignments", clientAssignmentsRouter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    message: "Backend läuft"
  });
});

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`API läuft auf http://localhost:${port}`);
});
