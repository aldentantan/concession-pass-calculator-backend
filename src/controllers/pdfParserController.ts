import { Request, Response } from 'express';
import { PdfParserService } from '../services/pdfParserService';

export class PdfParserController {
  private pdfParserService = new PdfParserService();

  /**
   * POST /pdf-parser
   * Upload and parse SimplyGo PDF
   */
  async uploadPdf(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No PDF file uploaded'
        });
      }

      console.log('📄 Received PDF file:', req.file.originalname);

      // Call service
      const journeys = await this.pdfParserService.parsePdf(req.file.buffer);

      // Format response
      return res.status(200).json({
        success: true,
        journeysCount: journeys.length,
        journeys
      });
    } catch (error) {
      console.error('❌ Error parsing PDF:', error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse PDF'
      });
    }
  }
}