import express from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { statementController } from '../controllers/statementsController';

const router = express.Router();

// ✅ Process PDF workflow endpoint
router.post(
  '/process',
  authenticateToken,
  (req, res) => statementController.processStatement(req, res)
);

// router.get(
//   '/',
//   authenticateToken,
//   (req, res) => statementController.getAll(req, res)
// );

// router.get(
//   '/:id',
//   authenticateToken,
//   (req, res) => statementController.getById(req, res)
// );

// router.delete(
//   '/:id',
//   authenticateToken,
//   (req, res) => statementController.delete(req, res)
// );

export default router;