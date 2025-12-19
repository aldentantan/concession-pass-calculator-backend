import express from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { statementController } from "../controllers/statementsController";

const router = express.Router();

// GET / - Retrieves all statements for authenticated user
router.get("/", authenticateToken, (req, res) =>
  statementController.getAll(req, res)
);

// POST /process - Processes uploaded SimplyGo PDF statement
router.post("/process", authenticateToken, (req, res) =>
  statementController.processStatement(req, res)
);

// DELETE /:id - Deletes a specific statement by ID
router.delete("/:id", authenticateToken, (req, res) => {
  console.log("Received DELETE request for ID:", req.params.id);
  statementController.deleteStatement(req, res);
});

export default router;
