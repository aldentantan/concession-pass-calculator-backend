import { statementsRepository } from "../repositories/statementsRepository";
import { pdfParserService } from "./pdfParserService";
import { concessionFareCalcService } from "./concessionFareCalculatorService";
import { supabase } from "../supabase";
import type { Journey } from "../types";

class StatementsService {
  async getAllStatementsByUserId(userId: string) {
    if (!userId) {
      throw new Error("Missing userId to retrieve statements");
    }
    return await statementsRepository.getStatementsByUserId(userId);
  }

  async createStatement(values: Record<string, any>) {
    if (!values) {
      throw new Error("Missing values to insert into the statements table");
    }
    if (
      !values.userId ||
      !values.filePath ||
      !values.fileName ||
      !values.fileHash
    ) {
      throw new Error(
        "Missing required fields: userId, filePath, fileName, or fileHash"
      );
    }
    if (!values.journeyCount || !values.totalFare) {
      throw new Error(
        "Missing required numeric fields: journeyCount, totalFare"
      );
    }
    return await statementsRepository.insertStatement(values);
  }

  async updateStatement(id: string, updates: string) {
    return await statementsRepository.updateStatement(id, updates);
  }

  async deleteStatement(id: string): Promise<void> {
    if (!id) {
      throw new Error("Missing statement ID to delete statement");
    }
    const filepath = await statementsRepository.getStatementFilePathById(id);
    const deleteResult = await supabase.storage
      .from("simplygo-pdf")
      .remove([filepath]);
    if (deleteResult.error) {
      console.log("Error deleting file from storage:", deleteResult.error);
      throw new Error("Failed to delete SimplyGo statement PDF from storage");
    }
    await statementsRepository.deleteStatement(id);
  }

  async getJourneysByStatementId(statementId: string): Promise<Journey[]> {
    return await statementsRepository.getJourneysByStatementId(statementId);
  }

  async createSignedLink(statementId: string): Promise<string> {
    const statementFilePath =
      await statementsRepository.getStatementFilePathById(statementId);

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("simplygo-pdf")
        .createSignedUrl(statementFilePath, 300);

    if (signedUrlError || !signedUrlData) {
      console.log("Signed URL error:", signedUrlError);
      throw new Error("Failed to create signed URL");
    }
    return signedUrlData.signedUrl;
  }

  async reanalyseStatement(statementId: string): Promise<{ journeys: Journey[]; fares: any }> {
    // Get file path of specific statement from statements DB table
    const filepath = await statementsRepository.getStatementFilePathById(statementId);

    // Download PDF from Supabase storage
    const { data, error } = await supabase.storage.from("simplygo-pdf").download(filepath);
    if (error) throw new Error(`Failed to download PDF from storage`);

    // Parse PDF and calculate fares
    const journeys = await pdfParserService.parsePdf(Buffer.from(await data.arrayBuffer()));
    const fares = await concessionFareCalcService.calculateFaresOnConcession(journeys);

    return { journeys, fares };
  }
}

export const statementsService = new StatementsService();
