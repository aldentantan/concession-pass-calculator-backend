import { Request, Response } from "express";
import { pdfParserService } from "../services/pdfParserService";

export class PdfParserController {
  /**
   * POST /pdf-parser
   * Upload and parse SimplyGo PDF
   */
  async uploadPdf(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded",
          message:
            "No file detected. Please upload a SimplyGo Transport Statement PDF file.",
        });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({
          error: "Invalid file type",
          message:
            "Uploaded file is not a PDF. Please upload a valid SimplyGo Transport Statement PDF file.",
        });
      }

      const journeys = await pdfParserService.parsePdf(req.file.buffer);

      if (!journeys || journeys.length === 0) {
        return res.status(400).json({
          error: "No journeys found",
          message:
            "No public transport journeys were found in the uploaded PDF. Please ensure you have uploaded a valid SimplyGo Transport Statement PDF file containing journey data.",
        });
      }

      // Format response
      return res.status(200).json({
        journeysCount: journeys.length,
        journeys,
      });
    } catch (error) {
      console.error("❌ Error parsing PDF:", error);
      if (error instanceof Error) {
        if (error.message.includes("No text extracted")) {
          return res.status(400).json({
            error: "Invalid PDF",
            message:
              "Could not read the PDF. The file may be corrupted or password-protected.",
          });
        }

        if (error.message.includes("Could not determine statement month")) {
          return res.status(400).json({
            error: "Invalid PDF format",
            message: error.message,
          });
        }

        if (error.message.includes("No public transport journeys found")) {
          return res.status(400).json({
            error: "No journeys found",
            message: error.message,
          });
        }
      }

      return res.status(500).json({
        error: "Failed to parse PDF",
        message: error instanceof Error ? error.message : "Failed to parse PDF",
      });
    }
  }
}
