import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const meRouter = Router();

meRouter.get("/", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

export { meRouter };
