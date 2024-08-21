import express from 'express';

import {
    addFavoriteLocation,
    getFavoriteLocations,
    updateFavoriteLocation,
    deleteFavoriteLocation
} from '../controllers/favoritesController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/add-favorite', addFavoriteLocation);
router.get('/get-favorites', getFavoriteLocations);  
router.put('/update-favorite', updateFavoriteLocation);
router.delete('/delete-favorite', deleteFavoriteLocation);

export default router;