import cors from 'cors';
import express from 'express';
import sql from './db';
import 'dotenv/config';

import pdfParserRouter from './routes/pdfParserRoutes';
import concessionFareCalculatorRouter from './routes/concessionFareCalculatorRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: 'http://localhost:5173'
};

app.use(cors(corsOptions));
app.use(express.json());

// Test DB connection on startup
(async () => {
  try {
    const result = await sql`SELECT NOW()`;
    console.log('✅ Database connected:', result[0].now);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
})();

// PDF Parser routes
app.use('/pdf-parser', pdfParserRouter);

// Concession Fare Calculator routes
app.use('/concession-fare-calculator', concessionFareCalculatorRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});