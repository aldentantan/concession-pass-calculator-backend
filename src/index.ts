import cors from 'cors';
import express from 'express';
import pdfParserRouter from './routes/pdfParserRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: 'http://localhost:5173'
};

app.use(cors(corsOptions));
app.use(express.json());

// PDF Parser routes
app.use('/pdf-parser', pdfParserRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});