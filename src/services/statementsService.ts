import { statementsRepository } from "../repositories/statementsRepository";
import { supabase } from "../supabase";
import type { DayGroup } from "../types";
import { concessionFareCalcService } from "./concessionFareCalculatorService";
import { pdfParserService } from "./pdfParserService";

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
    console.log("Creating statement with values:", values);
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
    if (values.journeyCount == null || values.totalFare == null) {
      throw new Error(
        "Missing required numeric fields: journeyCount, totalFare"
      );
    }
    return await statementsRepository.insertStatement(values);
  }

  async updateStatement(id: string, updates: string) {
    return await statementsRepository.updateStatement(id, updates);
  }

  async getStatementByFileHash(fileHash: string) {
    if (!fileHash) {
      throw new Error("Missing fileHash to retrieve statement");
    }

    return await statementsRepository.getStatementByFileHash(fileHash);
  }

  async uploadPdfToStorage(filePath: string, fileBuffer: Buffer): Promise<void> {
    const { error } = await supabase.storage
      .from("simplygo-pdf")
      .upload(filePath, fileBuffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf",
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async removePdfFromStorage(filePath: string): Promise<void> {
    const deleteResult = await supabase.storage
      .from("simplygo-pdf")
      .remove([filePath]);

    if (deleteResult.error) {
      throw new Error("Failed to delete SimplyGo statement PDF from storage");
    }
  }

  async deleteStatement(id: string): Promise<void> {
    if (!id) {
      throw new Error("Missing statement ID to delete statement");
    }
    const filepath = await statementsRepository.getStatementFilePathById(id);
    await statementsRepository.deleteStatement(id);

    try {
      await this.removePdfFromStorage(filepath);
    } catch (error) {
      console.log("Error deleting file from storage:", error);
      throw error;
    }
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
