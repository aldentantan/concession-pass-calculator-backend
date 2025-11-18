import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { PdfParserService } from '../services/pdfParserService';

const router = express.Router();
const pdfParserService = new PdfParserService();

// Configure multer for file uploads (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// POST upload SimplyGo PDF to parse and extract journeys and fare details
router.post('/', upload.single('pdf'), async (req, res) => {
  console.log("Received request to /api/upload-pdf");
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }
    console.log('Received PDF file:', req.file.originalname);

    const journeys = await pdfParserService.parsePdf(req.file.buffer);

    res.json({
      journeysCount: journeys.length,
      journeys
    });
  } catch (error) {
    console.error('Error parsing PDF:', error);
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

export default router;