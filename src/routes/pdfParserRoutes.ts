import express from 'express';
import multer from 'multer';
import { PdfParserController } from '../controllers/pdfParserController';

const router = express.Router();
const pdfParserController = new PdfParserController();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// POST upload SimplyGo PDF to parse and extract journeys and fare details
router.post('/',
  upload.single('pdf'),
  (req, res) => pdfParserController.uploadPdf(req, res)
);

export default router;