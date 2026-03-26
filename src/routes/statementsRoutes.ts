import express from "express";
import multer from "multer";
import { statementController } from "../controllers/statementsController";
import { authenticateToken } from "../middleware/authenticateToken";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET / - Retrieves all statements for authenticated user
router.get("/", authenticateToken, (req, res) =>
  statementController.getAll(req, res)
);

// GET /trips/range - Retrieves all trips for a user within a date range
router.get("/trips/range", authenticateToken, (req, res) =>
  statementController.getDayGroupsInDateRange(req, res)
);

// GET /:id/trip-summary - Retrieves trip summary for a statement in the DB (uploaded previously)
router.get("/:id/trip-summary", authenticateToken, (req, res) => {
  console.log("Fetching trip summary for statement ID:", req.params.id);
  statementController.getTripSummary(req, res);
}
);

// GET /:id/create-signed-link - Creates a signed link to view the statement PDF in browser
router.get("/:id/create-signed-link", authenticateToken, (req, res) =>
  statementController.createSignedLink(req, res)
);

// POST /process - Processes uploaded SimplyGo PDF statement
router.post("/process", authenticateToken, upload.single("file"), (req, res) =>
  statementController.processStatement(req, res)
);

// POST /process-guest - Processes a PDF for unauthenticated guest users (no persistence)
router.post("/process-guest", upload.single("file"), (req, res) =>
  statementController.processGuestStatement(req, res)
);

//POST /:id/reanalyse - Reanalyses an existing statement
router.post("/:id/reanalyse", authenticateToken, (req, res) =>
  statementController.reanalyseStatement(req, res)
);

// DELETE /:id - Deletes a specific statement by ID
router.delete("/:id", authenticateToken, (req, res) =>
  statementController.deleteStatement(req, res)
);

export default router;
