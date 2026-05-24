import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";

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
