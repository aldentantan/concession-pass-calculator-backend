import { statementsRepository } from "../repositories/statementsRepository";
import { pdfParserService } from "./pdfParserService";
import { concessionFareCalcService } from "./concessionFareCalculatorService";
import { supabase } from "../supabase";
import type { DayGroup, Trip } from "../types";

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
    if (!values.statementMonth || !values.statementYear) {
      throw new Error(
        "Missing required date fields: statementMonth, statementYear"
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

  async getDayGroupsByStatementId(statementId: string): Promise<DayGroup[]> {
    return await statementsRepository.getDayGroupsByStatementId(statementId);
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

  async reanalyseStatement(statementId: string): Promise<{ dayGroups: DayGroup[]; fares: any }> {
    // Get file path of specific statement from statements DB table
    const filepath = await statementsRepository.getStatementFilePathById(statementId);

    // Download PDF from Supabase storage
    const { data, error } = await supabase.storage.from("simplygo-pdf").download(filepath);
    if (error) throw new Error(`Failed to download PDF from storage`);

    // Parse PDF and calculate fares
    const { dayGroups } = await pdfParserService.parsePdf(Buffer.from(await data.arrayBuffer()));
    const fares = await concessionFareCalcService.calculateFaresOnConcession(dayGroups);

    return { dayGroups, fares };
  }

  async getDayGroupsInDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<DayGroup[]> {
    if (!userId || !startDate || !endDate) {
      throw new Error("Missing required parameters: userId, startDate, endDate");
    }
    return await statementsRepository.getDayGroupsByUserIdAndDateRange(
      userId,
      startDate,
      endDate
    );
  }

  async getConcessionFaresForDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ) {
    if (!userId || !startDate || !endDate) {
      throw new Error("Missing required parameters: userId, startDate, endDate");
    }
    return await statementsRepository.getConcessionFaresByUserIdAndDateRange(
      userId,
      startDate,
      endDate
    );
  }
}

export const statementsService = new StatementsService();
