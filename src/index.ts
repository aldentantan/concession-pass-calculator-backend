import cors from 'cors';
import express from 'express';
import sql from './db';
import 'dotenv/config';

import statementsRouter from './routes/statementsRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: ['http://localhost:5173', 'https://concession-pass-calculator.vercel.app']
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

// Main entry point for uploading PDF
app.use('/statements', statementsRouter)

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});