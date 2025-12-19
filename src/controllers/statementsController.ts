import { Request, Response } from "express";
import { pdfParserService } from "../services/pdfParserService";
import { statementsService } from "../services/statementsService";
import { concessionFareCalcService } from "../services/concessionFareCalculatorService";

export class StatementController {
  async getAll(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({
          error: "Invalid request",
          message: "Missing userId query parameter",
        });
      }

      const statements = await statementsService.getAllStatementsByUserId(
        userId
      );
      return res.status(200).json({
        statements,
      });
    } catch (error) {
      console.error("❌ Error retrieving statements:", error);
      return res.status(500).json({
        error: "Server error",
        message: "An unexpected error occurred",
      });
    }
  }

  /**
   * POST /api/statements/process
   * Complete workflow: download → parse → calculate → save
   */
  async processStatement(req: Request, res: Response): Promise<Response> {
    try {
      const { userId, signedUrl, storageFilePath, fileName } = req.body;

      if (!userId || !signedUrl || !storageFilePath || !fileName) {
        return res.status(400).json({
          error: "Invalid request",
          message: "Missing required fields",
        });
      }

      // Download PDF from Supabase storage bucket
      const response = await fetch(signedUrl);
      const arrayBuffer = await response.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);

      const journeys = await pdfParserService.parsePdf(pdfBuffer);
      const fares = await concessionFareCalcService.calculateFaresOnConcession(
        journeys
      );
      const statement = await statementsService.createStatement({
        userId,
        filePath: storageFilePath,
        fileName,
        // statementMonth: journeys.statementMonth,
        // statementYear: parseInt(journeys.statementYear),
        journeyCount: journeys.length,
        totalFare: fares.totalFare,
        journeys: JSON.stringify(journeys),
      });

      console.log("Statement saved successfully");

      return res.status(201).json({
        message: "PDF processed successfully",
        statement,
        journeys: journeys,
        fares,
      });
    } catch (error) {
      console.error("❌ Error processing statement:", error);

      if (error instanceof Error) {
        return res.status(400).json({
          error: "Processing error",
          message: error.message,
        });
      }

      return res.status(500).json({
        error: "Server error",
        message: "An unexpected error occurred",
      });
    }
  }

  async deleteStatement(req: Request, res: Response): Promise<Response> {
    try {
      const statementId = req.params.id;

      if (!statementId) {
        return res.status(400).json({
          error: "Invalid request",
          message: "Missing statement ID parameter",
        });
      }

      await statementsService.deleteStatement(statementId);
      return res.status(200).json({
        message: "Statement deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting statement:", error);
      return res.status(500).json({
        error: "Server error",
        message: "An unexpected error occurred",
      });
    }
  }
}

export const statementController = new StatementController();
