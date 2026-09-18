import {
  Router,
} from "express";

import {
  optimizeEnergyController,
} from "../controllers/optimize.controller";

const router =
  Router();

router.post(
  "/optimize-energy",
  optimizeEnergyController
);

export default router;