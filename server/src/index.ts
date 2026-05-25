import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { clientLinkTokensRouter } from "./routes/clientLinkTokens";
import { clientsRouter } from "./routes/clients";
import { meRouter } from "./routes/me";

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
