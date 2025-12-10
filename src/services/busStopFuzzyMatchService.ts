import Fuse from 'fuse.js';
import { busRepository } from '../repositories/busRepository';

class BusStopFuzzyMatchService {
  private fuse: Fuse<any> | null = null;

  /**
   * Initialize fuzzy search with all bus stops from LTA
   */
  async initializeFuzzySearch() {
    const allBusStops = await busRepository.getAllBusStops();
    this.fuse = new Fuse(allBusStops, {
      keys: ['bus_stop_name'],
      threshold: 0.3,
      includeScore: true,
    });
  }

  /**
   * Find best matching bus stop using fuzzy search
   */
  async findBusStop(pdfName: string): Promise<string[] | null> {
    if (!this.fuse) {
      await this.initializeFuzzySearch();
    }

    if (!this.fuse) {
        throw new Error('Fuzzy search initialization failed');
      }

    // Normalize the search query
    const normalizedQuery = this.normalizeStopName(pdfName);

    const results = this.fuse.search(normalizedQuery, { limit: 3 });
    // console.log(`Fuzzy search results for "${pdfName}":`, results);

    if (results.length === 0) {
      console.warn(`No bus stop found for the bus stop name "${pdfName}" from the SimplyGo PDF.`);
      return null;
    }

    const bestMatch = results[0];

    const match = [bestMatch.item.bus_stop_code];

    // console.log(`✅ Matched "${pdfName}" → "${bestMatch.item.bus_stop_name}"`);
    return match;
  }

  /**
   * Normalize bus stop names for better matching
   */
  private normalizeStopName(name: string): string {
    return name
      .replace(/\b(board|alight|alighting|boarding)\b/gi, '') // Remove common prefixes
      .trim();
  }
}

export const busStopFuzzyMatchService = new BusStopFuzzyMatchService();