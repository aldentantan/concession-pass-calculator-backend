import express from 'express';
import { ConcessionFareCalculatorController } from '../controllers/concessionFareCalculatorController';

const router = express.Router();
const concessionFareCalcController = new ConcessionFareCalculatorController();

router.post('/calculate-fares', async (req, res) => {
    const { journeys } = req.body;

    const response = await concessionFareCalcController.calculateConcessionFares(journeys);
    return res.status(200).json(response);
});

export default router;